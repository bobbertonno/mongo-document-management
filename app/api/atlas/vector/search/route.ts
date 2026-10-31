import { NextResponse, type NextRequest } from 'next/server'
import { COLLECTIONS, getDb, isAtlasConfigured } from '@/lib/atlas/client'
import { VECTOR_INDEX_NAME } from '@/lib/atlas/vector'
import { VOYAGE_MODEL, VoyageError, embedTexts, isVoyageConfigured } from '@/lib/atlas/voyage'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 200

export async function POST(request: NextRequest) {
  if (!isAtlasConfigured()) return NextResponse.json({ error: 'MongoDB Atlas is not configured' }, { status: 503 })
  if (!isVoyageConfigured()) return NextResponse.json({ error: 'VOYAGE_API_KEY is not configured' }, { status: 503 })
  const body = (await request.json().catch(() => ({}))) as { query?: unknown; tenantId?: unknown; limit?: unknown }
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query || query.length > 2000) return NextResponse.json({ error: 'Query must be 1-2000 characters' }, { status: 400 })
  if (typeof body.tenantId !== 'string' || !body.tenantId) return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || 50))

  const started = Date.now()
  let queryVector: number[]
  try {
    queryVector = (await embedTexts([query], 'query')).embeddings[0]
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: error instanceof VoyageError ? error.status : 502 })
  }
  const embedMs = Date.now() - started

  try {
    const db = await getDb()
    const hits = await db
      .collection(COLLECTIONS.documentChunks.name)
      .aggregate([
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: 'embedding',
            queryVector,
            numCandidates: Math.min(10_000, limit * 10),
            limit,
            filter: { tenantId: body.tenantId },
          },
        },
        { $project: { _id: 1, documentId: 1, versionId: 1, pageNumber: 1, score: { $meta: 'vectorSearchScore' } } },
      ])
      .toArray()
    return NextResponse.json({ hits, model: VOYAGE_MODEL, embedMs, searchMs: Date.now() - started - embedMs })
  } catch (error) {
    console.error('[vector] search failed', error)
    return NextResponse.json(
      { error: 'Atlas Vector Search query failed. The index may still be building; check its status in System Settings.' },
      { status: 502 },
    )
  }
}
