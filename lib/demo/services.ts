'use client'

import {
  ALLOWED_MIME_TYPES,
  CLASSIFICATIONS,
  DEPARTMENTS,
  MAX_UPLOAD_BYTES,
  ROLES,
  documentMetadataPatchSchema,
  type AuditEvent,
  type Classification,
  type DemoState,
  type Department,
  type DmsDocument,
  type DocumentChunk,
  type DocumentMetadataPatch,
  type DocumentType,
  type DocumentVersion,
  type OutboxEvent,
  type PipelineStep,
  type Role,
  type SetupState,
  type StorageProvider,
  type User,
} from '@/lib/domain/types'
import { commit, deleteObject, getDemoState, getObject, putObject, reloadState } from './store'
import { newId, nowIso, sha256Hex } from './util'
import { embedChunks } from './vector'

const storageProvider = (): StorageProvider => 'mongodb-gridfs'

export class DomainError extends Error {
  constructor(
    public code: 'VALIDATION' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'UNSUPPORTED',
    message: string,
  ) {
    super(message)
  }
}

export interface ActorContext {
  user: User
  tenantId: string
  correlationId: string
}

export function currentActor(correlationId = newId('corr')): ActorContext {
  const state = getDemoState()
  if (!state.setup?.completed) throw new DomainError('FORBIDDEN', 'Setup has not been completed')
  const user = state.users[0]
  if (!user) throw new DomainError('FORBIDDEN', 'No bootstrap administrator found')
  return { user, tenantId: state.setup.tenantId, correlationId }
}

function audit(
  draft: DemoState,
  actor: ActorContext,
  event: Omit<AuditEvent, 'eventId' | 'tenantId' | 'occurredAt' | 'actorId' | 'actorType' | 'correlationId' | 'requestId'> & {
    actorType?: AuditEvent['actorType']
  },
) {
  draft.auditEvents.push({
    eventId: newId('aud'),
    tenantId: actor.tenantId,
    occurredAt: nowIso(),
    actorId: actor.user._id,
    actorType: event.actorType ?? 'user',
    correlationId: actor.correlationId,
    requestId: newId('req'),
    ...event,
  })
}

function outbox(draft: DemoState, actor: ActorContext, topic: string, key: string, payload: Record<string, unknown>) {
  const event: OutboxEvent = {
    _id: newId('evt'),
    tenantId: actor.tenantId,
    topic,
    key,
    payload,
    correlationId: actor.correlationId,
    createdAt: nowIso(),
    publishedAt: null,
  }
  draft.outboxEvents.push(event)
}

const ROLE_RANK: Record<Role, number> = Object.fromEntries(ROLES.map((r, i) => [r, ROLES.length - i])) as Record<Role, number>

/** Document-level authorization, applied in every read path before limiting results. */
export function canRead(user: User, doc: DmsDocument): boolean {
  if (user.tenantId !== doc.tenantId) return false
  if (user.roles.includes('PlatformAdmin') || user.roles.includes('TenantAdmin')) return true
  const best = Math.max(...user.roles.map((r) => ROLE_RANK[r]))
  if (best < ROLE_RANK[doc.accessPolicy.minRole]) return false
  return doc.accessPolicy.departments === 'all' || (!!user.department && doc.accessPolicy.departments.includes(user.department))
}

export function accessTokensFor(doc: DmsDocument): string[] {
  const depts = doc.accessPolicy.departments === 'all' ? ['dept:*'] : doc.accessPolicy.departments.map((d) => `dept:${d}`)
  return [`tenant:${doc.tenantId}`, `minRole:${doc.accessPolicy.minRole}`, ...depts]
}

function defaultPolicy(classification: Classification, department: Department) {
  if (classification === 'Public' || classification === 'Internal')
    return { departments: 'all' as const, minRole: 'Viewer' as Role }
  if (classification === 'Confidential') return { departments: [department], minRole: 'Editor' as Role }
  return { departments: [department], minRole: 'DepartmentManager' as Role }
}

// ---------- Setup ----------

export async function completeSetup(input: {
  organization: string
  adminName: string
  adminEmail: string
  embeddingMode?: SetupState['embeddingMode']
}) {
  const embeddingMode = input.embeddingMode ?? 'disabled'
  const mode = 'atlas' as const
  await reloadState()
  if (getDemoState().setup?.completed) {
    throw new DomainError('CONFLICT', 'This Atlas cluster already has a configured tenant. Reload the app to use it.')
  }
  const tenantId = newId('tnt')
  const adminId = newId('usr')
  const correlationId = newId('corr')
  const setup: SetupState = {
    completed: true,
    mode,
    organization: input.organization,
    tenantId,
    adminName: input.adminName,
    adminEmail: input.adminEmail,
    storageProvider: storageProvider(),
    embeddingMode,
    kafkaMode: 'simulator',
    completedAt: nowIso(),
  }
  await commit((draft) => {
    draft.setup = setup
    draft.users = [
      { _id: adminId, tenantId, name: input.adminName, email: input.adminEmail, roles: ['TenantAdmin'] },
    ]
    draft.folders = DEPARTMENTS.map((department) => ({
      _id: newId('fld'),
      tenantId,
      name: `${department} Documents`,
      department,
    }))
    draft.auditEvents.push({
      eventId: newId('aud'),
      tenantId,
      occurredAt: nowIso(),
      actorId: adminId,
      actorType: 'user',
      action: 'setup.completed',
      resourceType: 'system_settings',
      resourceId: tenantId,
      result: 'success',
      correlationId,
      requestId: newId('req'),
      after: { mode, storageProvider: setup.storageProvider, embeddingMode, kafkaMode: 'simulator' },
    })
  })
}

/** Switches an existing tenant to Voyage AI embeddings after the vector index was initialized. */
export async function enableVectorSearch(actor = currentActor()) {
  if (getDemoState().setup?.embeddingMode === 'voyage') return
  await commit((draft) => {
    if (!draft.setup) throw new DomainError('CONFLICT', 'Complete setup first')
    const before = draft.setup.embeddingMode
    draft.setup.embeddingMode = 'voyage'
    audit(draft, actor, {
      action: 'settings.embedding_enabled',
      resourceType: 'system_settings',
      resourceId: draft.setup.tenantId,
      result: 'success',
      before: { embeddingMode: before },
      after: { embeddingMode: 'voyage' },
    })
  })
}

const vectorEnabled = () => getDemoState().setup?.embeddingMode === 'voyage'

/**
 * Embeds freshly committed chunks with Voyage AI (server side) and records the outcome on
 * each version's pipeline. Failures are non-fatal: chunks stay lexically searchable and can
 * be backfilled from System Settings.
 */
async function embedCommittedChunks(versionIds: string[], chunkIds: string[]) {
  if (!vectorEnabled() || !chunkIds.length) return
  const startedAt = nowIso()
  const t0 = performance.now()
  let embedding: PipelineStep
  let vectorIndexing: PipelineStep
  let model: string | null = null
  try {
    const result = await embedChunks(chunkIds)
    model = result.model
    const durationMs = Math.round(performance.now() - t0)
    embedding = { step: 'embedding', status: 'succeeded', startedAt, durationMs, note: `${result.embedded} chunk(s) embedded with ${result.model} (${result.tokens} tokens)` }
    vectorIndexing = { step: 'vector_indexing', status: 'succeeded', startedAt: nowIso(), durationMs: 0, note: 'Vectors written to document_chunks.embedding (Atlas Vector Search)' }
  } catch (error) {
    const durationMs = Math.round(performance.now() - t0)
    embedding = { step: 'embedding', status: 'failed', startedAt, durationMs, note: (error as Error).message }
    vectorIndexing = { step: 'vector_indexing', status: 'skipped', startedAt: nowIso(), durationMs: 0, note: 'Pending backfill from System Settings' }
  }
  const versionSet = new Set(versionIds)
  const chunkSet = new Set(chunkIds)
  await commit((draft) => {
    for (const v of draft.documentVersions) {
      if (!versionSet.has(v._id)) continue
      v.pipeline = v.pipeline.map((s) => (s.step === 'embedding' ? embedding : s.step === 'vector_indexing' ? vectorIndexing : s))
    }
    if (model) {
      for (const c of draft.documentChunks) if (chunkSet.has(c._id)) c.embeddingModel = model
    }
  })
}

// ---------- Ingestion pipeline ----------

const CHUNK_TARGET = 900

export function chunkPages(pages: string[]): { pageNumber: number; text: string }[] {
  const chunks: { pageNumber: number; text: string }[] = []
  pages.forEach((page, pageIndex) => {
    let buffer = ''
    for (const paragraph of page.split(/\n{2,}|\n(?=[A-Z0-9][^\n]{0,60}:)/)) {
      const p = paragraph.trim()
      if (!p) continue
      if ((buffer + '\n' + p).length > CHUNK_TARGET && buffer) {
        chunks.push({ pageNumber: pageIndex + 1, text: buffer })
        buffer = p
      } else buffer = buffer ? `${buffer}\n${p}` : p
    }
    if (buffer) chunks.push({ pageNumber: pageIndex + 1, text: buffer })
  })
  return chunks
}

export function validateFile(file: { name: string; type: string; size: number }) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const allowedExts = ALLOWED_MIME_TYPES[file.type]
  if (!allowedExts) throw new DomainError('VALIDATION', `Unsupported MIME type "${file.type || 'unknown'}"`)
  if (!allowedExts.includes(ext)) throw new DomainError('VALIDATION', `Extension .${ext} does not match MIME type ${file.type}`)
  if (file.size <= 0) throw new DomainError('VALIDATION', 'File is empty')
  if (file.size > MAX_UPLOAD_BYTES) throw new DomainError('VALIDATION', 'File exceeds the 10 MB limit')
}

async function sniffMagic(blob: Blob, mimeType: string) {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  const hex = Array.from(head, (b) => b.toString(16).padStart(2, '0')).join('')
  const ok =
    (mimeType === 'application/pdf' && hex.startsWith('25504446')) ||
    (mimeType === 'image/png' && hex.startsWith('89504e47')) ||
    (mimeType === 'image/jpeg' && hex.startsWith('ffd8ff')) ||
    (mimeType.includes('wordprocessingml') && hex.startsWith('504b0304')) ||
    mimeType.startsWith('text/')
  if (!ok) throw new DomainError('VALIDATION', 'File content does not match its declared type')
}

interface IngestInput {
  blob: Blob
  fileName: string
  mimeType: string
  /** Pre-extracted pages for generated documents; otherwise extracted from text files. */
  pages?: string[]
}

async function runPipeline(input: IngestInput) {
  const steps: PipelineStep[] = []
  const track = async <T>(step: PipelineStep['step'], fn: () => Promise<T> | T, note?: string, status: PipelineStep['status'] = 'succeeded') => {
    const startedAt = nowIso()
    const t0 = performance.now()
    try {
      const value = await fn()
      steps.push({ step, status, startedAt, durationMs: Math.round((performance.now() - t0) * 100) / 100, note })
      return value
    } catch (error) {
      steps.push({ step, status: 'failed', startedAt, durationMs: Math.round(performance.now() - t0), note: (error as Error).message })
      throw error
    }
  }

  await track('validation', async () => {
    validateFile({ name: input.fileName, type: input.mimeType, size: input.blob.size })
    await sniffMagic(input.blob, input.mimeType)
  }, 'MIME, extension, size and magic-byte checks')
  await track('quarantine', () => undefined, 'Held in memory until validation completed')
  await track('malware_scan', () => undefined, 'No malware scanner configured', 'skipped')
  const checksum = await sha256Hex(input.blob)
  const objectKey = `obj/${newId()}`
  await track('object_storage', () => putObject(objectKey, input.blob), 'Opaque key written to MongoDB GridFS bucket')

  let pages: string[] | null = input.pages ?? null
  let extractionStatus: DocumentVersion['extractionStatus'] = 'succeeded'
  if (!pages) {
    if (input.mimeType.startsWith('text/')) {
      const text = await input.blob.text()
      pages = text.split('\f')
    } else {
      extractionStatus = 'unsupported'
    }
  }
  steps.push({
    step: 'metadata',
    status: 'succeeded',
    startedAt: nowIso(),
    durationMs: 0,
    note: 'Metadata committed with audit + outbox records',
  })
  if (pages) {
    await track('extraction', () => undefined, `${pages.length} page(s) extracted`)
  } else {
    steps.push({ step: 'extraction', status: 'skipped', startedAt: nowIso(), durationMs: 0, note: `No in-browser extractor for ${input.mimeType}` })
  }
  const chunks = pages ? await track('chunking', () => chunkPages(pages!), 'Paragraph-aware chunks with page references') : []
  steps.push({
    step: 'search_indexing',
    status: pages ? 'succeeded' : 'skipped',
    startedAt: nowIso(),
    durationMs: 0,
    note: pages ? 'Chunks stored in document_chunks; ranked by the in-app BM25 index' : 'Nothing to index',
  })
  const willEmbed = vectorEnabled() && !!pages
  steps.push({
    step: 'embedding',
    status: 'skipped',
    startedAt: nowIso(),
    durationMs: 0,
    note: willEmbed ? 'Queued: Voyage AI embeds chunks after the metadata commit' : vectorEnabled() ? 'Nothing to embed' : 'Vector search not initialized (Setup Wizard / System Settings)',
  })
  steps.push({ step: 'vector_indexing', status: 'skipped', startedAt: nowIso(), durationMs: 0, note: willEmbed ? 'Queued' : 'Requires Atlas Vector Search' })
  steps.push({ step: 'ready', status: 'succeeded', startedAt: nowIso(), durationMs: 0 })
  return { steps, checksum, objectKey, chunks, extractionStatus }
}

export interface CreateDocumentInput extends IngestInput {
  title: string
  description: string
  department: Department
  documentType: DocumentType
  classification: Classification
  tags: string[]
  folderId?: string
  metadata?: Record<string, string | number | boolean>
  datasetId?: string
  generationRunId?: string
  createdAt?: string
  extraVersions?: IngestInput[]
}

export async function createDocument(input: CreateDocumentInput, actor = currentActor()) {
  const ingested = [await runPipeline(input)]
  for (const extra of input.extraVersions ?? []) ingested.push(await runPipeline(extra))
  const state = getDemoState()
  const folderId = input.folderId ?? state.folders.find((f) => f.department === input.department)?._id ?? ''
  const docId = newId('doc')
  const createdAt = input.createdAt ?? nowIso()
  const isGenerated = !!input.generationRunId
  const sources = [input, ...(input.extraVersions ?? [])]
  const versions: DocumentVersion[] = ingested.map((r, i) => ({
    _id: newId('ver'),
    tenantId: actor.tenantId,
    documentId: docId,
    versionNumber: i + 1,
    storageProvider: storageProvider(),
    objectKey: r.objectKey,
    checksum: r.checksum,
    mimeType: sources[i].mimeType,
    fileName: sources[i].fileName,
    fileSize: sources[i].blob.size,
    extractionStatus: r.extractionStatus,
    indexingStatus: r.chunks.length ? 'indexed' : 'not_indexed',
    pipeline: r.steps,
    createdBy: actor.user._id,
    createdAt,
  }))
  const current = versions[versions.length - 1]
  const doc: DmsDocument = {
    _id: docId,
    tenantId: actor.tenantId,
    title: input.title,
    description: input.description,
    documentType: input.documentType,
    category: input.documentType,
    department: input.department,
    ownerId: actor.user._id,
    folderId,
    tags: input.tags,
    classification: input.classification,
    metadata: input.metadata ?? {},
    status: 'Ready',
    currentVersionId: current._id,
    workflowInstanceId: null,
    accessPolicy: defaultPolicy(input.classification, input.department),
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    concurrencyVersion: 1,
    datasetId: input.datasetId,
    generationRunId: input.generationRunId,
  }
  const tokens = accessTokensFor(doc)
  const chunks: DocumentChunk[] = ingested.flatMap((r, vi) =>
    r.chunks.map((c, ci) => ({
      _id: newId('chk'),
      tenantId: actor.tenantId,
      documentId: docId,
      versionId: versions[vi]._id,
      chunkIndex: ci,
      pageNumber: c.pageNumber,
      text: c.text,
      effectiveAccessTokens: tokens,
      embeddingModel: null,
      embeddingVersion: null,
      indexingStatus: 'indexed' as const,
    })),
  )
  await commit((draft) => {
    draft.documents.push(doc)
    draft.documentVersions.push(...versions)
    draft.documentChunks.push(...chunks)
    audit(draft, actor, {
      actorType: isGenerated ? 'worker' : 'user',
      action: isGenerated ? 'document.generated' : 'document.uploaded',
      resourceType: 'document',
      resourceId: docId,
      result: 'success',
      after: { title: doc.title, department: doc.department, classification: doc.classification, versions: versions.length },
      details: { mimeType: current.mimeType, fileSize: current.fileSize, checksum: current.checksum, datasetId: input.datasetId },
    })
    outbox(draft, actor, 'document.uploaded', docId, { documentId: docId, versionId: current._id, mimeType: current.mimeType })
    if (chunks.length) outbox(draft, actor, 'document.indexed', docId, { documentId: docId, chunks: chunks.length })
  })
  await embedCommittedChunks(
    versions.map((v) => v._id),
    chunks.map((c) => c._id),
  )
  return doc
}

function loadDoc(documentId: string, actor: ActorContext) {
  const doc = getDemoState().documents.find((d) => d._id === documentId && d.tenantId === actor.tenantId)
  if (!doc) throw new DomainError('NOT_FOUND', 'Document not found')
  if (!canRead(actor.user, doc)) throw new DomainError('FORBIDDEN', 'You do not have access to this document')
  return doc
}

export async function uploadNewVersion(documentId: string, file: File, expectedConcurrency: number, actor = currentActor()) {
  const doc = loadDoc(documentId, actor)
  if (doc.deletedAt) throw new DomainError('CONFLICT', 'Restore the document before adding versions')
  if (doc.concurrencyVersion !== expectedConcurrency)
    throw new DomainError('CONFLICT', 'Document was modified by another operation. Reload and try again.')
  const r = await runPipeline({ blob: file, fileName: file.name, mimeType: file.type })
  const prevCount = getDemoState().documentVersions.filter((v) => v.documentId === documentId).length
  const version: DocumentVersion = {
    _id: newId('ver'),
    tenantId: actor.tenantId,
    documentId,
    versionNumber: prevCount + 1,
    storageProvider: storageProvider(),
    objectKey: r.objectKey,
    checksum: r.checksum,
    mimeType: file.type,
    fileName: file.name,
    fileSize: file.size,
    extractionStatus: r.extractionStatus,
    indexingStatus: r.chunks.length ? 'indexed' : 'not_indexed',
    pipeline: r.steps,
    createdBy: actor.user._id,
    createdAt: nowIso(),
  }
  const tokens = accessTokensFor(doc)
  const newChunks: DocumentChunk[] = r.chunks.map((c, i) => ({
        _id: newId('chk'),
        tenantId: actor.tenantId,
        documentId,
        versionId: version._id,
        chunkIndex: i,
        pageNumber: c.pageNumber,
        text: c.text,
        effectiveAccessTokens: tokens,
        embeddingModel: null,
        embeddingVersion: null,
        indexingStatus: 'indexed' as const,
      }))
  await commit((draft) => {
    const target = draft.documents.find((d) => d._id === documentId)!
    if (target.concurrencyVersion !== expectedConcurrency) throw new DomainError('CONFLICT', 'Concurrent modification detected')
    draft.documentVersions.push(version)
    draft.documentChunks.push(...newChunks)
    target.currentVersionId = version._id
    target.updatedAt = nowIso()
    target.concurrencyVersion += 1
    audit(draft, actor, {
      action: 'document.version_uploaded',
      resourceType: 'document',
      resourceId: documentId,
      result: 'success',
      after: { versionNumber: version.versionNumber, checksum: version.checksum },
    })
    outbox(draft, actor, 'document.updated', documentId, { documentId, versionId: version._id, change: 'new_version' })
  })
  await embedCommittedChunks(
    [version._id],
    newChunks.map((c) => c._id),
  )
}

export async function updateMetadata(documentId: string, patch: DocumentMetadataPatch, expectedConcurrency: number, actor = currentActor()) {
  const parsed = documentMetadataPatchSchema.safeParse(patch)
  if (!parsed.success) throw new DomainError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid metadata')
  const doc = loadDoc(documentId, actor)
  if (doc.concurrencyVersion !== expectedConcurrency)
    throw new DomainError('CONFLICT', 'Document was modified by another operation. Reload and try again.')
  const before = {
    title: doc.title,
    description: doc.description,
    department: doc.department,
    documentType: doc.documentType,
    classification: doc.classification,
    folderId: doc.folderId,
    tags: doc.tags,
  }
  await commit((draft) => {
    const target = draft.documents.find((d) => d._id === documentId)!
    Object.assign(target, parsed.data, { category: parsed.data.documentType })
    target.accessPolicy = defaultPolicy(parsed.data.classification, parsed.data.department)
    target.updatedAt = nowIso()
    target.concurrencyVersion += 1
    const tokens = accessTokensFor(target)
    for (const chunk of draft.documentChunks) if (chunk.documentId === documentId) chunk.effectiveAccessTokens = tokens
    audit(draft, actor, {
      action: 'document.metadata_updated',
      resourceType: 'document',
      resourceId: documentId,
      result: 'success',
      before,
      after: parsed.data,
    })
    outbox(draft, actor, 'document.updated', documentId, { documentId, change: 'metadata' })
    if (before.classification !== parsed.data.classification)
      outbox(draft, actor, 'document.classified', documentId, { documentId, classification: parsed.data.classification })
  })
}

export async function softDelete(documentId: string, actor = currentActor()) {
  const doc = loadDoc(documentId, actor)
  if (doc.deletedAt) return
  await commit((draft) => {
    const target = draft.documents.find((d) => d._id === documentId)!
    target.deletedAt = nowIso()
    target.concurrencyVersion += 1
    audit(draft, actor, { action: 'document.deleted', resourceType: 'document', resourceId: documentId, result: 'success', details: { soft: true } })
    outbox(draft, actor, 'document.deleted', documentId, { documentId, soft: true })
  })
}

export async function restoreDocument(documentId: string, actor = currentActor()) {
  loadDoc(documentId, actor)
  await commit((draft) => {
    const target = draft.documents.find((d) => d._id === documentId)!
    target.deletedAt = null
    target.concurrencyVersion += 1
    audit(draft, actor, { action: 'document.restored', resourceType: 'document', resourceId: documentId, result: 'success' })
    outbox(draft, actor, 'document.updated', documentId, { documentId, change: 'restored' })
  })
}

export async function readVersionBinary(
  documentId: string,
  versionId: string,
  purpose: 'download' | 'preview',
  actor = currentActor(),
): Promise<{ blob: Blob; version: DocumentVersion }> {
  const doc = loadDoc(documentId, actor)
  const version = getDemoState().documentVersions.find((v) => v._id === versionId && v.documentId === doc._id)
  if (!version) throw new DomainError('NOT_FOUND', 'Version not found')
  const blob = await getObject(version.objectKey)
  const ok = !!blob && (await sha256Hex(blob)) === version.checksum
  await commit((draft) => {
    audit(draft, actor, {
      action: `document.${purpose}`,
      resourceType: 'document',
      resourceId: documentId,
      result: ok ? 'success' : 'failure',
      details: { versionId, versionNumber: version.versionNumber, checksumVerified: ok },
    })
    if (ok) outbox(draft, actor, 'document.accessed', documentId, { documentId, versionId, purpose })
  })
  if (!blob) throw new DomainError('NOT_FOUND', 'Binary object is missing from storage')
  if (!ok) throw new DomainError('CONFLICT', 'Checksum mismatch: stored object failed integrity verification')
  return { blob: new Blob([blob], { type: version.mimeType }), version }
}

export async function recordAudit(event: Parameters<typeof audit>[2], actor = currentActor()) {
  await commit((draft) => audit(draft, actor, event))
}

/** Removes only records tagged with the dataset id, plus their stored binaries. */
export async function cleanupDataset(datasetId: string, actor = currentActor()) {
  const state = getDemoState()
  const docIds = new Set(state.documents.filter((d) => d.datasetId === datasetId).map((d) => d._id))
  const keys = state.documentVersions.filter((v) => docIds.has(v.documentId)).map((v) => v.objectKey)
  for (const key of keys) await deleteObject(key)
  await commit((draft) => {
    draft.documents = draft.documents.filter((d) => !docIds.has(d._id))
    draft.documentVersions = draft.documentVersions.filter((v) => !docIds.has(v.documentId))
    draft.documentChunks = draft.documentChunks.filter((c) => !docIds.has(c.documentId))
    draft.generationRuns = draft.generationRuns.filter((r) => r.datasetId !== datasetId)
    audit(draft, actor, {
      action: 'generator.dataset_cleaned',
      resourceType: 'generation_dataset',
      resourceId: datasetId,
      result: 'success',
      details: { documentsRemoved: docIds.size, objectsRemoved: keys.length },
    })
  })
  return docIds.size
}

export { CLASSIFICATIONS }
