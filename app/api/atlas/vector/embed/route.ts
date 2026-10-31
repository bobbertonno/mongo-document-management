import { NextResponse, type NextRequest } from 'next/server'
import type { AnyBulkWriteOperation, Document } from 'mongodb'
import { COLLECTIONS, getDb, isAtlasConfigured } from '@/lib/atlas/client'
import { EMBEDDING_VERSION, VOYAGE_MODEL, VoyageError, embedTexts, isVoyageConfigured } from '@/lib/atlas/voyage'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BACKFILL_BATCH = 256
const MAX_EXPLICIT_IDS = 2000

/**
 * Embeds chunks that do not have a vector yet. With `chunkIds` only those chunks are
 * processed (ingestion); without it the next backfill batch is processed.
 */
export async function POST(request: NextRequest) {
  if (!isAtlasConfigured()) return NextResponse.json({ error: 'MongoDB Atlas is not configured' }, { status: 503 })
  if (!isVoyageConfigured()) return NextResponse.json({ error: 'VOYAGE_API_KEY is not configured' }, { status: 503 })
  const body = (await request.json().catch(() => ({}))) as { chunkIds?: unknown }
  const ids = body.chunkIds
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > MAX_EXPLICIT_IDS || !ids.every((id) => typeof id === 'string'))) {
    return NextResponse.json({ error: 'chunkIds must be an array of up to 2000 ids' }, { status: 400 })
  }

  const db = await getDb()
  const collection = db.collection(COLLECTIONS.documentChunks.name)
  const filter: Document = { embedding: { $exists: false }, ...(ids ? { _id: { $in: ids } } : {}) }
  const pending = await collection
    .find(filter, { projection: { _id: 1, text: 1 } })
    .limit(ids ? MAX_EXPLICIT_IDS : BACKFILL_BATCH)
    .toArray()

  let tokens = 0
  if (pending.length) {
    try {
      const result = await embedTexts(
        pending.map((c) => String(c.text ?? '')),
        'document',
      )
      tokens = result.tokens
      const ops: AnyBulkWriteOperation<Document>[] = pending.map((chunk, i) => ({
        updateOne: {
          filter: { _id: chunk._id },
          update: { $set: { embedding: result.embeddings[i], embeddingModel: VOYAGE_MODEL, embeddingVersion: EMBEDDING_VERSION } },
        },
      }))
      await collection.bulkWrite(ops, { ordered: false })
    } catch (error) {
      const status = error instanceof VoyageError ? error.status : 502
      console.error('[vector] embedding failed', error)
      return NextResponse.json({ error: (error as Error).message }, { status })
    }
  }
  const remaining = await collection.countDocuments({ embedding: { $exists: false } })
  return NextResponse.json({ embedded: pending.length, remaining, tokens, model: VOYAGE_MODEL })
}
