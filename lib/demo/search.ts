'use client'

import type { Classification, DemoState, Department, DmsDocument, DocumentType } from '@/lib/domain/types'
import { canRead, currentActor, recordAudit } from './services'
import { getDemoState } from './store'

export type SearchMode = 'metadata' | 'fulltext' | 'semantic' | 'hybrid'

export interface SearchFilters {
  department?: Department
  documentType?: DocumentType
  classification?: Classification
}

export interface SearchHit {
  document: DmsDocument
  score: number
  matchingChunks: { chunkId: string; pageNumber: number; snippet: { text: string; highlight: boolean }[] }[]
}

export interface SearchResponse {
  mode: SearchMode
  engine: string
  query: string
  hits: SearchHit[]
  totalMatches: number
  chunksScanned: number
  chunksMatched: number
  deniedByAcl: number
  latencyMs: number
  facets: { department: Record<string, number>; documentType: Record<string, number>; classification: Record<string, number> }
  equivalentAtlasPipeline: object[]
}

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is', 'are', 'by', 'at', 'be', 'this', 'that'])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

function snippet(text: string, terms: Set<string>) {
  const words = text.split(/(\s+)/)
  const firstHit = words.findIndex((w) => terms.has(w.toLowerCase().replace(/[^a-z0-9]/g, '')))
  const start = Math.max(0, firstHit - 24)
  const slice = words.slice(start, start + 70)
  const parts: { text: string; highlight: boolean }[] = []
  if (start > 0) parts.push({ text: '... ', highlight: false })
  for (const w of slice) {
    const hl = terms.has(w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    const last = parts[parts.length - 1]
    if (last && last.highlight === hl) last.text += w
    else parts.push({ text: w, highlight: hl })
  }
  return parts
}

function currentDocs(state: DemoState, filters: SearchFilters) {
  return state.documents.filter(
    (d) =>
      !d.deletedAt &&
      (!filters.department || d.department === filters.department) &&
      (!filters.documentType || d.documentType === filters.documentType) &&
      (!filters.classification || d.classification === filters.classification),
  )
}

function facetsOf(docs: DmsDocument[]) {
  const count = (key: 'department' | 'documentType' | 'classification') =>
    docs.reduce<Record<string, number>>((acc, d) => ((acc[d[key]] = (acc[d[key]] ?? 0) + 1), acc), {})
  return { department: count('department'), documentType: count('documentType'), classification: count('classification') }
}

/**
 * Demo Mode search engine. Runs over the real persisted demo chunks using BM25 scoring.
 * Authorization is applied before ranking/limiting, stale (non-current) chunks are excluded,
 * and chunk hits are deduplicated into document-level results.
 */
export async function runSearch(mode: SearchMode, query: string, filters: SearchFilters, limit = 20): Promise<SearchResponse> {
  if (mode === 'semantic' || mode === 'hybrid') {
    throw new Error('Semantic and hybrid search require Voyage AI embeddings and Atlas Vector Search, which are not configured in Demo Mode.')
  }
  const t0 = performance.now()
  const actor = currentActor()
  const state = getDemoState()
  const candidates = currentDocs(state, filters)
  const authorized = candidates.filter((d) => canRead(actor.user, d))
  const deniedByAcl = candidates.length - authorized.length
  const terms = tokenize(query)
  const termSet = new Set(terms)

  let hits: SearchHit[] = []
  let chunksScanned = 0
  let chunksMatched = 0

  if (mode === 'metadata') {
    const q = query.trim().toLowerCase()
    hits = authorized
      .filter(
        (d) =>
          !q ||
          d.title.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          Object.values(d.metadata).some((v) => String(v).toLowerCase().includes(q)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((document) => ({ document, score: 0, matchingChunks: [] }))
  } else {
    if (!terms.length) throw new Error('Enter at least one search term')
    const byId = new Map(authorized.map((d) => [d._id, d]))
    const chunks = state.documentChunks.filter((c) => {
      const doc = byId.get(c.documentId)
      return doc && doc.currentVersionId === c.versionId
    })
    chunksScanned = chunks.length
    const tokenized = chunks.map((c) => tokenize(c.text))
    const avgLen = tokenized.reduce((s, t) => s + t.length, 0) / Math.max(1, tokenized.length)
    const df = new Map<string, number>()
    for (const toks of tokenized) for (const t of new Set(toks)) if (termSet.has(t)) df.set(t, (df.get(t) ?? 0) + 1)
    const k1 = 1.2
    const b = 0.75
    const perDoc = new Map<string, SearchHit>()
    chunks.forEach((chunk, i) => {
      const toks = tokenized[i]
      let score = 0
      for (const term of termSet) {
        const tf = toks.filter((t) => t === term).length
        if (!tf) continue
        const n = df.get(term) ?? 0
        const idf = Math.log(1 + (chunks.length - n + 0.5) / (n + 0.5))
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * toks.length) / avgLen)))
      }
      const doc = byId.get(chunk.documentId)!
      const titleBoost = tokenize(doc.title).some((t) => termSet.has(t)) ? 1.5 : 0
      if (score <= 0) return
      chunksMatched++
      const total = score + titleBoost
      const existing = perDoc.get(doc._id)
      const match = { chunkId: chunk._id, pageNumber: chunk.pageNumber, snippet: snippet(chunk.text, termSet) }
      if (!existing) perDoc.set(doc._id, { document: doc, score: total, matchingChunks: [match] })
      else {
        existing.score = Math.max(existing.score, total)
        existing.matchingChunks.push(match)
      }
    })
    hits = [...perDoc.values()].sort((a, b2) => b2.score - a.score)
    for (const h of hits) h.matchingChunks = h.matchingChunks.slice(0, 3)
  }

  const totalMatches = hits.length
  const response: SearchResponse = {
    mode,
    engine: mode === 'metadata' ? 'Demo: in-memory filter over persisted metadata' : 'Demo: local BM25 over persisted chunks (not MongoDB Search)',
    query,
    hits: hits.slice(0, limit),
    totalMatches,
    chunksScanned,
    chunksMatched,
    deniedByAcl,
    latencyMs: Math.round((performance.now() - t0) * 100) / 100,
    facets: facetsOf(hits.map((h) => h.document)),
    equivalentAtlasPipeline: equivalentPipeline(mode, query, filters, limit),
  }
  await recordAudit(
    {
      action: 'search.executed',
      resourceType: 'search',
      resourceId: mode,
      result: 'success',
      details: { mode, termCount: terms.length, results: totalMatches, latencyMs: response.latencyMs },
    },
    actor,
  )
  return response
}

function equivalentPipeline(mode: SearchMode, query: string, filters: SearchFilters, limit: number): object[] {
  const filter = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  if (mode === 'metadata') {
    return [
      { $match: { tenantId: '<session.tenantId>', deletedAt: null, ...filter, $or: [{ title: { $regex: '<escaped query>', $options: 'i' } }, { tags: '<query>' }] } },
      { $match: { effectiveAccessTokens: { $in: '<session access tokens>' } } },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
    ]
  }
  return [
    {
      $search: {
        index: 'document_chunks_search',
        compound: {
          must: [{ text: { query, path: 'text' } }],
          filter: [
            { equals: { path: 'tenantId', value: '<session.tenantId>' } },
            { in: { path: 'effectiveAccessTokens', value: '<session access tokens>' } },
            { equals: { path: 'isCurrentVersion', value: true } },
          ],
        },
        highlight: { path: 'text' },
      },
    },
    { $group: { _id: '$documentId', score: { $max: { $meta: 'searchScore' } }, chunks: { $push: '$$ROOT' } } },
    { $sort: { score: -1 } },
    { $limit: limit },
  ]
}
