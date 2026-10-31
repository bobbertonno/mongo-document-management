import { NextResponse, type NextRequest } from 'next/server'
import type { Document } from 'mongodb'
import { COLLECTIONS, getDb, isAtlasConfigured } from '@/lib/atlas/client'
import { EmbeddingError, embedTexts, loadEmbeddingConfig, resolveApiKey } from '@/lib/atlas/embeddings'
import { vectorIndexName } from '@/lib/atlas/vector'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 200

export async function POST(request: NextRequest) {
  if (!isAtlasConfigured()) return NextResponse.json({ error: 'MongoDB Atlas is not configured' }, { status: 503 })
  const body = (await request.json().catch(() => ({}))) as { query?: unknown; tenantId?: unknown; limit?: unknown }
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query || query.length > 2000) return NextResponse.json({ error: 'Query must be 1-2000 characters' }, { status: 400 })
  if (typeof body.tenantId !== 'string' || !body.tenantId) return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || 50))

  const db = await getDb()
  const config = await loadEmbeddingConfig(db)
  if (!config) return NextResponse.json({ error: 'Vector search is not initialized' }, { status: 409 })
  const automated = config.provider === 'atlas-auto'
  const index = vectorIndexName(config)

  const started = Date.now()
  let queryInput: Document
  if (automated) {
    // Atlas embeds the query text with the same Voyage model used for the indexed chunks.
    queryInput = { path: 'text', query: { text: query } }
  } else {
    try {
      const vector = (await embedTexts(config, resolveApiKey(config), [query], 'query')).embeddings[0]
      queryInput = { path: 'embedding', queryVector: vector }
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: error instanceof EmbeddingError ? error.status : 502 })
    }
  }
  const embedMs = Date.now() - started

  try {
    const hits = await db
      .collection(COLLECTIONS.documentChunks.name)
      .aggregate([
        {
          $vectorSearch: {
            index,
            ...queryInput,
            numCandidates: Math.min(10_000, limit * 10),
            limit,
            filter: { tenantId: body.tenantId },
          },
        },
        { $project: { _id: 1, documentId: 1, versionId: 1, pageNumber: 1, score: { $meta: 'vectorSearchScore' } } },
      ])
      .toArray()
    return NextResponse.json({ hits, model: config.model, provider: config.provider, automated, index, embedMs, searchMs: Date.now() - started - embedMs })
  } catch (error) {
    console.error('[vector] search failed', error)
    return NextResponse.json(
      { error: 'Atlas Vector Search query failed. The index may still be building; check its status in System Settings.' },
      { status: 502 },
    )
  }
}
