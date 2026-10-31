import { createHash } from 'node:crypto'
import type { Db, Document } from 'mongodb'
import { COLLECTIONS } from './client'
import { defaultEmbeddingConfig, loadEmbeddingConfig, publicKeyHints, type EmbeddingConfig } from './embeddings'
import { isEncryptionConfigured } from './secrets'
import type { EmbeddingProviderId } from '@/lib/domain/embedding'

const INDEX_PREFIX = 'document_chunks_vector'
const chunks = (db: Db) => db.collection(COLLECTIONS.documentChunks.name)

export interface VectorIndexInfo {
  name: string
  status: string
  queryable: boolean
}

export interface VectorStatus {
  configured: boolean
  provider: EmbeddingProviderId
  model: string
  dimensions: number
  automated: boolean
  keyHints: Partial<Record<EmbeddingProviderId, string>>
  encryptionConfigured: boolean
  index: VectorIndexInfo | null
  chunks: { total: number; embedded: number }
}

/** The index name encodes provider, model and dimensions so a switch builds a fresh index. */
export function vectorIndexName(config: Pick<EmbeddingConfig, 'provider' | 'model' | 'dimensions'>): string {
  const hash = createHash('sha256').update(`${config.provider}|${config.model}|${config.dimensions}`).digest('hex').slice(0, 8)
  return `${INDEX_PREFIX}_${config.provider === 'atlas-auto' ? 'auto' : 'custom'}_${hash}`
}

export const vectorPath = (config: EmbeddingConfig) => (config.provider === 'atlas-auto' ? 'text' : 'embedding')

function indexDefinition(config: EmbeddingConfig): Document {
  const vectorField =
    config.provider === 'atlas-auto'
      ? { type: 'autoEmbed', modality: 'text', path: 'text', model: config.model }
      : { type: 'vector', path: 'embedding', numDimensions: config.dimensions, similarity: 'cosine' }
  return {
    fields: [
      vectorField,
      { type: 'filter', path: 'tenantId' },
      { type: 'filter', path: 'documentId' },
      { type: 'filter', path: 'versionId' },
    ],
  }
}

async function listVectorIndexes(db: Db): Promise<{ name: string; status?: string; queryable?: boolean; type?: string }[]> {
  try {
    return (await chunks(db).listSearchIndexes().toArray()) as never
  } catch (error) {
    if ((error as { code?: number }).code === 26) return []
    throw error
  }
}

export async function getVectorIndex(db: Db, config: EmbeddingConfig): Promise<VectorIndexInfo | null> {
  const name = vectorIndexName(config)
  const index = (await listVectorIndexes(db)).find((i) => i.name === name)
  return index ? { name, status: String(index.status ?? 'UNKNOWN'), queryable: !!index.queryable } : null
}

export async function getVectorStatus(db: Db): Promise<VectorStatus> {
  const stored = await loadEmbeddingConfig(db)
  const config = stored ?? defaultEmbeddingConfig()
  const automated = config.provider === 'atlas-auto'
  const [index, total, embedded] = await Promise.all([
    stored ? getVectorIndex(db, config) : null,
    chunks(db).countDocuments({}),
    automated ? Promise.resolve(-1) : chunks(db).countDocuments({ embedding: { $exists: true }, embeddingModel: config.model }),
  ])
  return {
    configured: !!stored,
    provider: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    automated,
    keyHints: publicKeyHints(stored),
    encryptionConfigured: isEncryptionConfigured(),
    index,
    // Atlas embeds every chunk with a text field itself, so all chunks count as embedded once the index exists.
    chunks: { total, embedded: automated ? (index ? total : 0) : embedded },
  }
}

/**
 * Creates the index for the active config and drops vector indexes and stored vectors that
 * belong to a previous provider/model, so queries never mix incompatible embedding spaces.
 */
export async function applyVectorIndex(db: Db, config: EmbeddingConfig): Promise<void> {
  const exists = await db.listCollections({ name: COLLECTIONS.documentChunks.name }, { nameOnly: true }).hasNext()
  if (!exists) await db.createCollection(COLLECTIONS.documentChunks.name)
  const target = vectorIndexName(config)
  const indexes = await listVectorIndexes(db)
  for (const index of indexes) {
    if (index.name !== target && index.name.startsWith(INDEX_PREFIX)) await chunks(db).dropSearchIndex(index.name)
  }
  const staleVectors = config.provider === 'atlas-auto' ? { embedding: { $exists: true } } : { embedding: { $exists: true }, embeddingModel: { $ne: config.model } }
  await chunks(db).updateMany(staleVectors, { $unset: { embedding: '', embeddingVersion: '' }, $set: { embeddingModel: null } })
  if (!indexes.some((i) => i.name === target)) {
    await chunks(db).createSearchIndex({ name: target, type: 'vectorSearch', definition: indexDefinition(config) })
  }
}
