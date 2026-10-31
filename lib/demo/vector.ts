'use client'

export interface VectorStatus {
  voyageConfigured: boolean
  model: string
  dimensions: number
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

export async function initVectorSearch(): Promise<VectorStatus> {
  return readJson<VectorStatus>(await post('/api/atlas/vector'))
}

export async function embedChunks(chunkIds?: string[]) {
  return readJson<{ embedded: number; remaining: number; tokens: number; model: string }>(
    await post('/api/atlas/vector/embed', chunkIds ? { chunkIds } : {}),
  )
}

export async function vectorQuery(query: string, tenantId: string, limit = 60) {
  return readJson<{ hits: VectorHit[]; model: string; embedMs: number; searchMs: number }>(
    await post('/api/atlas/vector/search', { query, tenantId, limit }),
  )
}
