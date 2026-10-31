import { NextResponse, type NextRequest } from 'next/server'
import { getDb, isAtlasConfigured, isValidObjectKey } from '@/lib/atlas/client'
import { StorageError, describeS3Error, getObjectStores } from '@/lib/atlas/storage'
import { MAX_UPLOAD_BYTES } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function readKey(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  return isValidObjectKey(key) ? key : null
}

function failure(action: string, provider: string, error: unknown) {
  console.error(`[storage] object ${action} failed (${provider})`, error)
  if (error instanceof StorageError) return NextResponse.json({ error: error.message }, { status: error.status })
  const where = provider === 'aws-s3' ? `S3 (${describeS3Error(error)})` : 'GridFS'
  return NextResponse.json({ error: `Failed to ${action} object in ${where}` }, { status: 502 })
}

export async function PUT(request: NextRequest) {
  if (!isAtlasConfigured()) return NextResponse.json({ error: 'Atlas Mode is not configured' }, { status: 503 })
  const key = readKey(request)
  if (!key) return NextResponse.json({ error: 'Invalid object key' }, { status: 400 })
  const bytes = Buffer.from(await request.arrayBuffer())
  if (bytes.length === 0) return NextResponse.json({ error: 'Empty object' }, { status: 400 })
  if (bytes.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'Object exceeds the 10 MB limit' }, { status: 413 })
  let provider = 'unknown'
  try {
    const { active } = await getObjectStores(await getDb())
    provider = active.provider
    await active.put(key, bytes, request.headers.get('content-type') || 'application/octet-stream')
    return NextResponse.json({ ok: true, size: bytes.length, storageProvider: active.provider })
  } catch (error) {
    return failure('store', provider, error)
  }
}

/** Reads from the active store first, then the other one, so files written before a provider switch stay readable. */
export async function GET(request: NextRequest) {
  if (!isAtlasConfigured()) return NextResponse.json({ error: 'Atlas Mode is not configured' }, { status: 503 })
  const key = readKey(request)
  if (!key) return NextResponse.json({ error: 'Invalid object key' }, { status: 400 })
  let provider = 'unknown'
  try {
    const { active, fallback } = await getObjectStores(await getDb())
    provider = active.provider
    let object = await active.get(key)
    if (!object && fallback) object = await fallback.get(key).catch(() => null)
    if (!object) return NextResponse.json({ error: 'Object not found' }, { status: 404 })
    return new NextResponse(new Uint8Array(object.bytes), {
      headers: { 'content-type': object.contentType, 'cache-control': 'private, no-store' },
    })
  } catch (error) {
    return failure('read', provider, error)
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAtlasConfigured()) return NextResponse.json({ error: 'Atlas Mode is not configured' }, { status: 503 })
  const key = readKey(request)
  if (!key) return NextResponse.json({ error: 'Invalid object key' }, { status: 400 })
  let provider = 'unknown'
  try {
    const { active, fallback } = await getObjectStores(await getDb())
    provider = active.provider
    await active.delete(key)
    await fallback?.delete(key).catch(() => undefined)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return failure('delete', provider, error)
  }
}
