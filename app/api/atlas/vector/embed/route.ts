import { NextResponse, type NextRequest } from 'next/server'
import type { AnyBulkWriteOperation, Document } from 'mongodb'
import { COLLECTIONS, getDb, isAtlasConfigured } from '@/lib/atlas/client'
import { EMBEDDING_VERSION, EmbeddingError, embedTexts, loadEmbeddingConfig, resolveApiKey } from '@/lib/atlas/embeddings'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BACKFILL_BATCH = 256
const MAX_EXPLICIT_IDS = 2000

/**
 * Embeds chunks with the customer's provider key. With `chunkIds` only those chunks are
 * processed (ingestion); without it the next backfill batch is processed. With Atlas
 * automated embedding this is a no-op because Atlas embeds the `text` field itself.
 */
export async function POST(request: NextRequest) {
  if (!isAtlasConfigured()) return NextResponse.json({ error: 'MongoDB Atlas is not configured' }, { status: 503 })
  const body = (await request.json().catch(() => ({}))) as { chunkIds?: unknown }
  const ids = body.chunkIds
  if (ids !== undefined && (!Array.isArray(ids) || ids.length > MAX_EXPLICIT_IDS || !ids.every((id) => typeof id === 'string'))) {
    return NextResponse.json({ error: 'chunkIds must be an array of up to 2000 ids' }, { status: 400 })
  }

  const db = await getDb()
  const config = await loadEmbeddingConfig(db)
  if (!config) return NextResponse.json({ error: 'Vector search is not initialized' }, { status: 409 })
  if (config.provider === 'atlas-auto') {
    return NextResponse.json({ automated: true, embedded: Array.isArray(ids) ? ids.length : 0, remaining: 0, tokens: 0, model: config.model })
  }

  const collection = db.collection(COLLECTIONS.documentChunks.name)
  const missing: Document = { $or: [{ embedding: { $exists: false } }, { embeddingModel: { $ne: config.model } }] }
  const filter: Document = { ...missing, ...(ids ? { _id: { $in: ids } } : {}) }
  const pending = await collection
    .find(filter, { projection: { _id: 1, text: 1 } })
    .limit(ids ? MAX_EXPLICIT_IDS : BACKFILL_BATCH)
    .toArray()

  let tokens = 0
  if (pending.length) {
    try {
      const result = await embedTexts(
        config,
        resolveApiKey(config),
        pending.map((c) => String(c.text ?? '')),
        'document',
      )
      tokens = result.tokens
      const ops: AnyBulkWriteOperation<Document>[] = pending.map((chunk, i) => ({
        updateOne: {
          filter: { _id: chunk._id },
          update: { $set: { embedding: result.embeddings[i], embeddingModel: config.model, embeddingVersion: EMBEDDING_VERSION } },
        },
      }))
      await collection.bulkWrite(ops, { ordered: false })
    } catch (error) {
      console.error('[vector] embedding failed', error)
      const status = error instanceof EmbeddingError ? error.status : 502
      return NextResponse.json({ error: (error as Error).message }, { status })
    }
  }
  const remaining = await collection.countDocuments(missing)
  return NextResponse.json({ automated: false, embedded: pending.length, remaining, tokens, model: config.model })
}
