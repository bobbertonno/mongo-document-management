import { NextResponse } from 'next/server'
import { atlasDatabaseName, getDb, isAtlasConfigured } from '@/lib/atlas/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isAtlasConfigured()) {
    return NextResponse.json({ configured: false, connected: false, database: null })
  }
  const started = Date.now()
  try {
    const db = await getDb()
    await db.command({ ping: 1 })
    const setup = await db.collection('system_settings').findOne({ _id: 'setup' as never })
    return NextResponse.json({
      configured: true,
      connected: true,
      database: atlasDatabaseName(),
      latencyMs: Date.now() - started,
      setupCompleted: !!setup,
    })
  } catch (error) {
    console.error('[atlas] status check failed', error)
    return NextResponse.json({
      configured: true,
      connected: false,
      database: atlasDatabaseName(),
      error: 'Could not connect to MongoDB Atlas. Check MONGODB_URI and the cluster network access list.',
    })
  }
}
