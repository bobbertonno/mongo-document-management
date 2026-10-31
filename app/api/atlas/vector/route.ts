import { NextResponse } from 'next/server'
import { getDb, isAtlasConfigured } from '@/lib/atlas/client'
import { ensureVectorIndex, getVectorStatus } from '@/lib/atlas/vector'
import { EMBEDDING_DIMENSIONS, VoyageError, embedTexts, isVoyageConfigured } from '@/lib/atlas/voyage'

export const dynamic = 'force-dynamic'

const notConfigured = () => NextResponse.json({ error: 'MongoDB Atlas is not configured' }, { status: 503 })

export async function GET() {
  if (!isAtlasConfigured()) return notConfigured()
  try {
    return NextResponse.json(await getVectorStatus(await getDb()))
  } catch (error) {
    console.error('[vector] status failed', error)
    return NextResponse.json({ error: 'Failed to read Atlas Vector Search status' }, { status: 502 })
  }
}

/** Verifies the Voyage AI key and creates the Atlas Vector Search index on document_chunks. */
export async function POST() {
  if (!isAtlasConfigured()) return notConfigured()
  if (!isVoyageConfigured()) {
    return NextResponse.json({ error: 'VOYAGE_API_KEY is not configured in the project environment variables' }, { status: 503 })
  }
  try {
    const { embeddings } = await embedTexts(['Atlas Document Hub connectivity check'], 'query')
    if (embeddings[0]?.length !== EMBEDDING_DIMENSIONS) {
      return NextResponse.json({ error: `Voyage AI returned ${embeddings[0]?.length ?? 0} dimensions, expected ${EMBEDDING_DIMENSIONS}` }, { status: 502 })
    }
  } catch (error) {
    const status = error instanceof VoyageError ? error.status : 502
    return NextResponse.json({ error: (error as Error).message }, { status })
  }
  try {
    const db = await getDb()
    await ensureVectorIndex(db)
    return NextResponse.json(await getVectorStatus(db))
  } catch (error) {
    console.error('[vector] index creation failed', error)
    return NextResponse.json(
      { error: `Could not create the Atlas Vector Search index: ${(error as Error).message}` },
      { status: 502 },
    )
  }
}
