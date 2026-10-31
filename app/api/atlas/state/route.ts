import { NextResponse, type NextRequest } from 'next/server'
import type { AnyBulkWriteOperation, Document } from 'mongodb'
import {
  COLLECTIONS,
  COLLECTION_KEYS,
  OBJECTS_BUCKET,
  SETTINGS_COLLECTION,
  getDb,
  isAtlasConfigured,
  type CollectionKey,
} from '@/lib/atlas/client'
import { purgeS3Objects } from '@/lib/atlas/storage'

export const dynamic = 'force-dynamic'

const MAX_RECORDS_PER_COMMIT = 5000

const notConfigured = () => NextResponse.json({ error: 'Atlas Mode is not configured' }, { status: 503 })

export async function GET() {
  if (!isAtlasConfigured()) return notConfigured()
  try {
    const db = await getDb()
    const setupDoc = await db.collection(SETTINGS_COLLECTION).findOne({ _id: 'setup' as never }, { projection: { _id: 0 } })
    const entries = await Promise.all(
      COLLECTION_KEYS.map(async (key) => {
        const { name, idField } = COLLECTIONS[key]
        const projection: Record<string, 0> = idField === '_id' ? {} : { _id: 0 }
        if (key === 'documentChunks') projection.embedding = 0
        const docs = await db.collection(name).find({}, { projection }).toArray()
        return [key, docs] as const
      }),
    )
    return NextResponse.json({ schemaVersion: 1, setup: setupDoc ?? null, ...Object.fromEntries(entries) })
  } catch (error) {
    console.error('[atlas] state load failed', error)
    return NextResponse.json({ error: 'Failed to load state from MongoDB Atlas' }, { status: 502 })
  }
}

interface CommitBody {
  setup?: Record<string, unknown> | null
  upserts?: Partial<Record<CollectionKey, Record<string, unknown>[]>>
  deletes?: Partial<Record<CollectionKey, string[]>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Applies one store commit (record upserts + deletes across collections) inside a
 * MongoDB transaction, so a document change, its audit event and its outbox event
 * land together or not at all.
 */
export async function POST(request: NextRequest) {
  if (!isAtlasConfigured()) return notConfigured()
  let body: CommitBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!isRecord(body)) return NextResponse.json({ error: 'Invalid commit payload' }, { status: 400 })

  const operations: { collection: string; ops: AnyBulkWriteOperation<Document>[] }[] = []
  let total = 0
  for (const key of COLLECTION_KEYS) {
    const { name, idField } = COLLECTIONS[key]
    const ops: AnyBulkWriteOperation<Document>[] = []
    const upserts: unknown = (body.upserts as Record<string, unknown> | undefined)?.[key] ?? []
    const deletes: unknown = (body.deletes as Record<string, unknown> | undefined)?.[key] ?? []
    if (!Array.isArray(upserts) || !Array.isArray(deletes)) {
      return NextResponse.json({ error: `Invalid changes for ${key}` }, { status: 400 })
    }
    for (const record of upserts) {
      const id = isRecord(record) ? record[idField] : undefined
      if (typeof id !== 'string' || !id) return NextResponse.json({ error: `Record in ${key} is missing ${idField}` }, { status: 400 })
      const { _id: _ignored, ...rest } = record
      if (key === 'documentChunks') {
        // Embedding fields are owned by the server-side Voyage pipeline; never let client commits overwrite them.
        const { embedding: _e, embeddingModel: _m, embeddingVersion: _v, ...fields } = rest
        ops.push({ updateOne: { filter: { _id: id as never }, update: { $set: fields }, upsert: true } })
      } else {
        ops.push({ replaceOne: { filter: { _id: id as never }, replacement: rest, upsert: true } })
      }
    }
    for (const id of deletes) {
      if (typeof id !== 'string' || !id) return NextResponse.json({ error: `Invalid id in ${key} deletes` }, { status: 400 })
      ops.push({ deleteOne: { filter: { _id: id as never } } })
    }
    total += ops.length
    if (ops.length) operations.push({ collection: name, ops })
  }
  if (total > MAX_RECORDS_PER_COMMIT) return NextResponse.json({ error: 'Commit is too large' }, { status: 413 })
  if (body.setup !== undefined && body.setup !== null && !isRecord(body.setup)) {
    return NextResponse.json({ error: 'Invalid setup payload' }, { status: 400 })
  }

  try {
    const db = await getDb()
    const session = db.client.startSession()
    try {
      await session.withTransaction(async () => {
        if (body.setup) {
          await db
            .collection(SETTINGS_COLLECTION)
            .replaceOne({ _id: 'setup' as never }, body.setup, { upsert: true, session })
        }
        for (const { collection, ops } of operations) {
          await db.collection(collection).bulkWrite(ops, { ordered: true, session })
        }
      })
    } finally {
      await session.endSession()
    }
    return NextResponse.json({ ok: true, applied: total })
  } catch (error) {
    console.error('[atlas] commit failed', error)
    return NextResponse.json({ error: 'Failed to write changes to MongoDB Atlas' }, { status: 502 })
  }
}

/** Drops every application collection, the GridFS object bucket and app-written S3 objects. */
export async function DELETE() {
  if (!isAtlasConfigured()) return notConfigured()
  try {
    const db = await getDb()
    await purgeS3Objects(db).catch((error) => console.error('[storage] S3 purge during reset failed', error))
    const names = [
      SETTINGS_COLLECTION,
      ...COLLECTION_KEYS.map((k) => COLLECTIONS[k].name),
      `${OBJECTS_BUCKET}.files`,
      `${OBJECTS_BUCKET}.chunks`,
    ]
    await Promise.all(names.map((name) => db.collection(name).deleteMany({})))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[atlas] reset failed', error)
    return NextResponse.json({ error: 'Failed to reset MongoDB Atlas data' }, { status: 502 })
  }
}
