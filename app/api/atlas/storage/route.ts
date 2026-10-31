import { NextResponse, type NextRequest } from 'next/server'
import { getDb, isAtlasConfigured } from '@/lib/atlas/client'
import { isEncryptionConfigured } from '@/lib/atlas/secrets'
import { StorageError, buildStorageConfig, loadStorageConfig, saveStorageConfig, storageStatus, verifyS3 } from '@/lib/atlas/storage'
import type { StorageConfigInput } from '@/lib/domain/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const notConfigured = () => NextResponse.json({ error: 'MongoDB Atlas is not configured' }, { status: 503 })

export async function GET() {
  if (!isAtlasConfigured()) return notConfigured()
  try {
    return NextResponse.json(storageStatus(await loadStorageConfig(await getDb())))
  } catch (error) {
    console.error('[storage] status failed', error)
    return NextResponse.json({ error: 'Failed to read storage settings' }, { status: 502 })
  }
}

const optionalString = (v: unknown) => v === undefined || typeof v === 'string'

function parseInput(body: unknown): StorageConfigInput | null {
  if (typeof body !== 'object' || body === null) return null
  const { provider, s3 } = body as Record<string, unknown>
  if (provider === 'mongodb-gridfs') return { provider }
  if (provider !== 'aws-s3' || typeof s3 !== 'object' || s3 === null) return null
  const f = s3 as Record<string, unknown>
  if (typeof f.bucket !== 'string' || typeof f.region !== 'string') return null
  if (![f.prefix, f.endpoint, f.accessKeyId, f.secretAccessKey].every(optionalString)) return null
  if (f.forcePathStyle !== undefined && typeof f.forcePathStyle !== 'boolean') return null
  return {
    provider,
    s3: {
      bucket: f.bucket,
      region: f.region,
      prefix: f.prefix as string | undefined,
      endpoint: f.endpoint as string | undefined,
      forcePathStyle: f.forcePathStyle as boolean | undefined,
      accessKeyId: f.accessKeyId as string | undefined,
      secretAccessKey: f.secretAccessKey as string | undefined,
    },
  }
}

/** Selects GridFS or S3 for new uploads. S3 keys are encrypted at rest, verified with a probe object and never returned. */
export async function POST(request: NextRequest) {
  if (!isAtlasConfigured()) return notConfigured()
  const input = parseInput(await request.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'Invalid storage configuration' }, { status: 400 })
  if (input.provider === 'aws-s3' && !isEncryptionConfigured()) {
    return NextResponse.json(
      { error: 'SETTINGS_ENCRYPTION_KEY is not set, so S3 keys cannot be stored securely. Use GridFS or add the variable.' },
      { status: 503 },
    )
  }
  try {
    const db = await getDb()
    const { config, credentials } = buildStorageConfig(input, await loadStorageConfig(db))
    if (credentials) await verifyS3(config, credentials)
    await saveStorageConfig(db, config)
    return NextResponse.json(storageStatus(config))
  } catch (error) {
    if (error instanceof StorageError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[storage] save failed', error)
    return NextResponse.json({ error: 'Could not save storage settings' }, { status: 500 })
  }
}
