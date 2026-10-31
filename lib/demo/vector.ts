'use client'

import type { EmbeddingConfigInput, EmbeddingProviderId } from '@/lib/domain/embedding'

export interface VectorStatus {
  configured: boolean
  provider: EmbeddingProviderId
  model: string
  dimensions: number
  automated: boolean
  keyHints: Partial<Record<EmbeddingProviderId, string>>
  encryptionConfigured: boolean
  index: { name: string; status: string; queryable: boolean } | null
  chunks: { total: number; embedded: number }
}

export interface VectorHit {
  _id: string
  documentId: string
  versionId: string
  pageNumber: number
  score: number
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`)
  return body as T
}

const post = (url: string, body?: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })

export async function fetchVectorStatus(): Promise<VectorStatus> {
  return readJson<VectorStatus>(await fetch('/api/atlas/vector', { cache: 'no-store' }))
}

export async function initVectorSearch(config: EmbeddingConfigInput): Promise<VectorStatus> {
  return readJson<VectorStatus>(await post('/api/atlas/vector', config))
}

export async function embedChunks(chunkIds?: string[]) {
  return readJson<{ automated: boolean; embedded: number; remaining: number; tokens: number; model: string }>(
    await post('/api/atlas/vector/embed', chunkIds ? { chunkIds } : {}),
  )
}

export async function vectorQuery(query: string, tenantId: string, limit = 60) {
  return readJson<{
    hits: VectorHit[]
    model: string
    provider: EmbeddingProviderId
    automated: boolean
    index: string
    embedMs: number
    searchMs: number
  }>(await post('/api/atlas/vector/search', { query, tenantId, limit }))
}

export const embeddingModeFor = (status: Pick<VectorStatus, 'automated'>) => (status.automated ? 'automated' : 'custom') as 'automated' | 'custom'
