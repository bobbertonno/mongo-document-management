'use client'

import type { Classification, DemoState, Department, DmsDocument, DocumentChunk, DocumentType } from '@/lib/domain/types'
import { canRead, currentActor, recordAudit } from './services'
import { getDemoState } from './store'
import { vectorQuery } from './vector'

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
const RRF_K = 60

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

interface RankedResult {
  hits: SearchHit[]
  chunksScanned: number
  chunksMatched: number
}

function addChunkHit(perDoc: Map<string, SearchHit>, doc: DmsDocument, chunk: DocumentChunk, score: number, terms: Set<string>) {
  const match = { chunkId: chunk._id, pageNumber: chunk.pageNumber, snippet: snippet(chunk.text, terms) }
  const existing = perDoc.get(doc._id)
  if (!existing) perDoc.set(doc._id, { document: doc, score, matchingChunks: [match] })
  else {
    existing.score = Math.max(existing.score, score)
    existing.matchingChunks.push(match)
  }
}

function finalize(perDoc: Map<string, SearchHit>) {
  const hits = [...perDoc.values()].sort((a, b) => b.score - a.score)
  for (const h of hits) h.matchingChunks = h.matchingChunks.slice(0, 3)
  return hits
}

/** BM25 over the current-version chunks of authorized documents. */
function lexicalSearch(state: DemoState, byId: Map<string, DmsDocument>, termSet: Set<string>): RankedResult {
  const chunks = state.documentChunks.filter((c) => {
    const doc = byId.get(c.documentId)
    return doc && doc.currentVersionId === c.versionId
  })
  const tokenized = chunks.map((c) => tokenize(c.text))
  const avgLen = tokenized.reduce((s, t) => s + t.length, 0) / Math.max(1, tokenized.length)
  const df = new Map<string, number>()
  for (const toks of tokenized) for (const t of new Set(toks)) if (termSet.has(t)) df.set(t, (df.get(t) ?? 0) + 1)
  const k1 = 1.2
  const b = 0.75
  const perDoc = new Map<string, SearchHit>()
  let chunksMatched = 0
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
    if (score <= 0) return
    chunksMatched++
    const doc = byId.get(chunk.documentId)!
    const titleBoost = tokenize(doc.title).some((t) => termSet.has(t)) ? 1.5 : 0
    addChunkHit(perDoc, doc, chunk, score + titleBoost, termSet)
  })
  return { hits: finalize(perDoc), chunksScanned: chunks.length, chunksMatched }
}

/**
 * Atlas Vector Search ($vectorSearch) over Voyage AI embeddings. The tenant filter runs inside
 * Atlas; ACLs, facet filters and the current-version check are re-applied here before ranking.
 */
async function semanticSearch(state: DemoState, byId: Map<string, DmsDocument>, query: string, tenantId: string, termSet: Set<string>) {
  const result = await vectorQuery(query, tenantId, 100)
  const chunkById = new Map(state.documentChunks.map((c) => [c._id, c]))
  const perDoc = new Map<string, SearchHit>()
  let chunksMatched = 0
  for (const hit of result.hits) {
    const doc = byId.get(hit.documentId)
    const chunk = chunkById.get(hit._id)
    if (!doc || !chunk || doc.currentVersionId !== hit.versionId) continue
    chunksMatched++
    addChunkHit(perDoc, doc, chunk, hit.score, termSet)
  }
  return {
    ranked: { hits: finalize(perDoc), chunksScanned: result.hits.length, chunksMatched } satisfies RankedResult,
    model: result.model,
    automated: result.automated,
    index: result.index,
  }
}

function reciprocalRankFusion(lists: SearchHit[][]): SearchHit[] {
  const fused = new Map<string, SearchHit>()
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const contribution = 1 / (RRF_K + rank + 1)
      const existing = fused.get(hit.document._id)
      if (!existing) fused.set(hit.document._id, { ...hit, score: contribution, matchingChunks: [...hit.matchingChunks] })
      else {
        existing.score += contribution
        for (const c of hit.matchingChunks) {
          if (!existing.matchingChunks.some((m) => m.chunkId === c.chunkId)) existing.matchingChunks.push(c)
        }
      }
    })
  }
  return finalize(fused)
}

export async function runSearch(mode: SearchMode, query: string, filters: SearchFilters, limit = 20): Promise<SearchResponse> {
  const t0 = performance.now()
  const actor = currentActor()
  const state = getDemoState()
  const usesVectors = mode === 'semantic' || mode === 'hybrid'
  if (usesVectors && (!state.setup?.embeddingMode || state.setup.embeddingMode === 'disabled')) {
    throw new Error('Vector search is not initialized. Configure the embedding provider in System Settings.')
  }
  const candidates = currentDocs(state, filters)
  const authorized = candidates.filter((d) => canRead(actor.user, d))
  const deniedByAcl = candidates.length - authorized.length
  const byId = new Map(authorized.map((d) => [d._id, d]))
  const terms = tokenize(query)
  const termSet = new Set(terms)

  let ranked: RankedResult = { hits: [], chunksScanned: 0, chunksMatched: 0 }
  let engine = ''
  let vector: VectorPipelineInfo | undefined

  if (mode === 'metadata') {
    const q = query.trim().toLowerCase()
    ranked.hits = authorized
      .filter(
        (d) =>
          !q ||
          d.title.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          Object.values(d.metadata).some((v) => String(v).toLowerCase().includes(q)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((document) => ({ document, score: 0, matchingChunks: [] }))
    engine = 'Metadata filter over MongoDB Atlas documents'
  } else if (mode === 'fulltext') {
    if (!terms.length) throw new Error('Enter at least one search term')
    ranked = lexicalSearch(state, byId, termSet)
    engine = 'BM25 over chunks persisted in MongoDB Atlas'
  } else {
    if (!query.trim()) throw new Error('Enter a search query')
    const semantic = await semanticSearch(state, byId, query, actor.tenantId, termSet)
    vector = { automated: semantic.automated, model: semantic.model, index: semantic.index }
    const embedder = semantic.automated ? `Atlas automated embedding, ${semantic.model}` : semantic.model
    if (mode === 'semantic') {
      ranked = semantic.ranked
      engine = `Atlas Vector Search (${embedder})`
    } else {
      const lexical = terms.length ? lexicalSearch(state, byId, termSet) : { hits: [], chunksScanned: 0, chunksMatched: 0 }
      ranked = {
        hits: reciprocalRankFusion([lexical.hits, semantic.ranked.hits]),
        chunksScanned: lexical.chunksScanned + semantic.ranked.chunksScanned,
        chunksMatched: lexical.chunksMatched + semantic.ranked.chunksMatched,
      }
      engine = `Reciprocal rank fusion: BM25 + Atlas Vector Search (${embedder})`
    }
  }

  const totalMatches = ranked.hits.length
  const response: SearchResponse = {
    mode,
    engine,
    query,
    hits: ranked.hits.slice(0, limit),
    totalMatches,
    chunksScanned: ranked.chunksScanned,
    chunksMatched: ranked.chunksMatched,
    deniedByAcl,
    latencyMs: Math.round((performance.now() - t0) * 100) / 100,
    facets: facetsOf(ranked.hits.map((h) => h.document)),
    equivalentAtlasPipeline: equivalentPipeline(mode, query, filters, limit, vector),
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

interface VectorPipelineInfo {
  automated: boolean
  model: string
  index: string
}

const vectorStage = (limit: number, query: string, vector?: VectorPipelineInfo) => ({
  $vectorSearch: {
    index: vector?.index ?? 'document_chunks_vector_<provider>',
    ...(vector?.automated
      ? { path: 'text', query: { text: query } }
      : { path: 'embedding', queryVector: `<${vector?.model ?? 'provider'} query embedding>` }),
    numCandidates: limit * 10,
    limit: limit * 5,
    filter: { tenantId: '<session.tenantId>' },
  },
})

function equivalentPipeline(mode: SearchMode, query: string, filters: SearchFilters, limit: number, vector?: VectorPipelineInfo): object[] {
  const filter = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  if (mode === 'metadata') {
    return [
      { $match: { tenantId: '<session.tenantId>', deletedAt: null, ...filter, $or: [{ title: { $regex: '<escaped query>', $options: 'i' } }, { tags: '<query>' }] } },
      { $match: { effectiveAccessTokens: { $in: '<session access tokens>' } } },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
    ]
  }
  if (mode === 'semantic') {
    return [
      vectorStage(limit, query, vector),
      { $project: { documentId: 1, versionId: 1, pageNumber: 1, score: { $meta: 'vectorSearchScore' } } },
      { $group: { _id: '$documentId', score: { $max: '$score' }, chunks: { $push: '$$ROOT' } } },
      { $sort: { score: -1 } },
      { $limit: limit },
    ]
  }
  const searchStage = {
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
  }
  if (mode === 'hybrid') {
    return [
      {
        $rankFusion: {
          input: { pipelines: { vector: [vectorStage(limit, query, vector)], fullText: [searchStage, { $limit: limit * 5 }] } },
          combination: { weights: { vector: 1, fullText: 1 } },
        },
      },
      { $group: { _id: '$documentId', chunks: { $push: '$$ROOT' } } },
      { $limit: limit },
    ]
  }
  return [
    searchStage,
    { $group: { _id: '$documentId', score: { $max: { $meta: 'searchScore' } }, chunks: { $push: '$$ROOT' } } },
    { $sort: { score: -1 } },
    { $limit: limit },
  ]
}
