import { z } from 'zod'

export const DEPARTMENTS = ['HR', 'Legal', 'Finance', 'Procurement', 'IT', 'Operations', 'Compliance', 'Sales'] as const
export const DOCUMENT_TYPES = [
  'Contract',
  'Invoice',
  'Policy',
  'Procedure',
  'Report',
  'Proposal',
  'Meeting Minutes',
  'Technical Specification',
  'Onboarding Record',
  'Vendor Agreement',
] as const
export const CLASSIFICATIONS = ['Public', 'Internal', 'Confidential', 'Restricted'] as const
export const ROLES = [
  'PlatformAdmin',
  'TenantAdmin',
  'ComplianceAuditor',
  'DepartmentManager',
  'Approver',
  'Editor',
  'Viewer',
] as const
export const DOCUMENT_STATUSES = ['Draft', 'Processing', 'Ready', 'InReview', 'Approved', 'Rejected', 'Failed'] as const

export type Department = (typeof DEPARTMENTS)[number]
export type DocumentType = (typeof DOCUMENT_TYPES)[number]
export type Classification = (typeof CLASSIFICATIONS)[number]
export type Role = (typeof ROLES)[number]
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number]

export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'text/plain': ['txt'],
  'text/csv': ['csv'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
}
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type StorageProvider = 'browser-indexeddb' | 'aws-s3' | 'azure-blob' | 'gcs' | 'minio' | 'local-fs'
export type OperatingMode = 'demo' | 'atlas'

export interface SetupState {
  completed: boolean
  mode: OperatingMode
  organization: string
  tenantId: string
  adminName: string
  adminEmail: string
  storageProvider: StorageProvider
  embeddingMode: 'disabled' | 'automated' | 'voyage'
  kafkaMode: 'simulator' | 'external'
  completedAt?: string
}

export interface User {
  _id: string
  tenantId: string
  name: string
  email: string
  roles: Role[]
  department?: Department
}

export interface Folder {
  _id: string
  tenantId: string
  name: string
  department: Department
}

export interface AccessPolicy {
  departments: Department[] | 'all'
  minRole: Role
}

export interface DmsDocument {
  _id: string
  tenantId: string
  title: string
  description: string
  documentType: DocumentType
  category: string
  department: Department
  ownerId: string
  folderId: string
  tags: string[]
  classification: Classification
  metadata: Record<string, string | number | boolean>
  status: DocumentStatus
  currentVersionId: string
  workflowInstanceId: string | null
  accessPolicy: AccessPolicy
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  concurrencyVersion: number
  datasetId?: string
  generationRunId?: string
}

export type PipelineStepName =
  | 'validation'
  | 'quarantine'
  | 'malware_scan'
  | 'object_storage'
  | 'metadata'
  | 'extraction'
  | 'chunking'
  | 'search_indexing'
  | 'embedding'
  | 'vector_indexing'
  | 'ready'

export interface PipelineStep {
  step: PipelineStepName
  status: 'succeeded' | 'skipped' | 'failed'
  startedAt: string
  durationMs: number
  note?: string
}

export interface DocumentVersion {
  _id: string
  tenantId: string
  documentId: string
  versionNumber: number
  storageProvider: StorageProvider
  objectKey: string
  checksum: string
  mimeType: string
  fileName: string
  fileSize: number
  extractionStatus: 'succeeded' | 'unsupported' | 'failed'
  indexingStatus: 'indexed' | 'not_indexed' | 'failed'
  pipeline: PipelineStep[]
  createdBy: string
  createdAt: string
}

export interface DocumentChunk {
  _id: string
  tenantId: string
  documentId: string
  versionId: string
  chunkIndex: number
  pageNumber: number
  text: string
  effectiveAccessTokens: string[]
  embeddingModel: null
  embeddingVersion: null
  indexingStatus: 'indexed'
}

export interface AuditEvent {
  eventId: string
  tenantId: string
  occurredAt: string
  actorId: string
  actorType: 'user' | 'system' | 'worker'
  action: string
  resourceType: string
  resourceId: string
  result: 'success' | 'failure' | 'denied'
  correlationId: string
  requestId: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  details?: Record<string, unknown>
}

export interface OutboxEvent {
  _id: string
  tenantId: string
  topic: string
  key: string
  payload: Record<string, unknown>
  correlationId: string
  createdAt: string
  publishedAt: string | null
}

export interface GenerationRun {
  _id: string
  tenantId: string
  datasetId: string
  seed: number
  target: number
  completed: number
  formats: ('txt' | 'pdf')[]
  departments: Department[]
  maxVersions: number
  status: 'running' | 'paused' | 'cancelled' | 'completed' | 'failed'
  error?: string
  checkpoint: number
  correlationId: string
  createdAt: string
  updatedAt: string
}

export interface DemoState {
  schemaVersion: 1
  setup: SetupState | null
  users: User[]
  folders: Folder[]
  documents: DmsDocument[]
  documentVersions: DocumentVersion[]
  documentChunks: DocumentChunk[]
  auditEvents: AuditEvent[]
  outboxEvents: OutboxEvent[]
  generationRuns: GenerationRun[]
}

export const documentMetadataPatchSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(2000),
  department: z.enum(DEPARTMENTS),
  documentType: z.enum(DOCUMENT_TYPES),
  classification: z.enum(CLASSIFICATIONS),
  folderId: z.string().min(1),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
})
export type DocumentMetadataPatch = z.infer<typeof documentMetadataPatchSchema>

export const setupEnvironmentSchema = z.object({
  organization: z.string().trim().min(2, 'Organization is required').max(80),
  adminName: z.string().trim().min(2, 'Administrator name is required').max(80),
  adminEmail: z.email('Enter a valid email'),
})
