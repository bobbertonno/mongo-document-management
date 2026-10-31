import { NextResponse, type NextRequest } from 'next/server'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { getBucket, isAtlasConfigured, isValidObjectKey } from '@/lib/atlas/client'
import { MAX_UPLOAD_BYTES } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function readKey(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  return isValidObjectKey(key) ? key : null
}

async function removeExisting(key: string) {
  const bucket = await getBucket()
  const files = await bucket.find({ filename: key }).toArray()
  await Promise.all(files.map((f) => bucket.delete(f._id)))
}

export async function PUT(request: NextRequest) {
  if (!isAtlasConfigured()) return NextResponse.json({ error: 'Atlas Mode is not configured' }, { status: 503 })
  const key = readKey(request)
  if (!key) return NextResponse.json({ error: 'Invalid object key' }, { status: 400 })
  const bytes = Buffer.from(await request.arrayBuffer())
  if (bytes.length === 0) return NextResponse.json({ error: 'Empty object' }, { status: 400 })
  if (bytes.length > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'Object exceeds the 10 MB limit' }, { status: 413 })
  try {
    await removeExisting(key)
    const bucket = await getBucket()
    const contentType = request.headers.get('content-type') || 'application/octet-stream'
    await pipeline(Readable.from(bytes), bucket.openUploadStream(key, { metadata: { contentType } }))
    return NextResponse.json({ ok: true, size: bytes.length })
  } catch (error) {
    console.error('[atlas] object upload failed', error)
    return NextResponse.json({ error: 'Failed to store object in GridFS' }, { status: 502 })
  }
}

export async function GET(request: NextRequest) {
  if (!isAtlasConfigured()) return NextResponse.json({ error: 'Atlas Mode is not configured' }, { status: 503 })
  const key = readKey(request)
  if (!key) return NextResponse.json({ error: 'Invalid object key' }, { status: 400 })
  try {
    const bucket = await getBucket()
    const file = await bucket.find({ filename: key }).sort({ uploadDate: -1 }).limit(1).next()
    if (!file) return NextResponse.json({ error: 'Object not found' }, { status: 404 })
    const chunks: Buffer[] = []
    for await (const chunk of bucket.openDownloadStream(file._id)) chunks.push(chunk as Buffer)
    return new NextResponse(Buffer.concat(chunks), {
      headers: {
        'content-type': (file.metadata?.contentType as string) || 'application/octet-stream',
        'cache-control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('[atlas] object read failed', error)
    return NextResponse.json({ error: 'Failed to read object from GridFS' }, { status: 502 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAtlasConfigured()) return NextResponse.json({ error: 'Atlas Mode is not configured' }, { status: 503 })
  const key = readKey(request)
  if (!key) return NextResponse.json({ error: 'Invalid object key' }, { status: 400 })
  try {
    await removeExisting(key)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[atlas] object delete failed', error)
    return NextResponse.json({ error: 'Failed to delete object from GridFS' }, { status: 502 })
  }
}
