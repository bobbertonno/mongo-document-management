import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import type { Db } from 'mongodb'
import { SETTINGS_COLLECTION, getBucket } from './client'
import { decryptSecret, encryptSecret, isEncryptionConfigured, keyHint, type EncryptedSecret } from './secrets'
import {
  DEFAULT_STORAGE_PROVIDER,
  S3_BUCKET_PATTERN,
  S3_PREFIX_PATTERN,
  S3_REGION_PATTERN,
  type ObjectStorageProviderId,
  type StorageConfigInput,
  type StorageStatus,
} from '@/lib/domain/storage'

const SETTINGS_ID = 'storage'
const SECRET_CONTEXT = { id: 'storage-s3:access-key-id', secret: 'storage-s3:secret-access-key' }

interface S3Config {
  bucket: string
  region: string
  prefix: string
  endpoint: string
  forcePathStyle: boolean
  accessKeyId: EncryptedSecret
  secretAccessKey: EncryptedSecret
  accessKeyIdHint: string
}

export interface StorageConfig {
  provider: ObjectStorageProviderId
  /** Kept when switching back to GridFS so the keys need not be re-entered. */
  s3: S3Config | null
  updatedAt: string
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export interface StoredObject {
  bytes: Buffer
  contentType: string
}

export interface ObjectStore {
  provider: ObjectStorageProviderId
  put(key: string, bytes: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject | null>
  delete(key: string): Promise<void>
}

export async function loadStorageConfig(db: Db): Promise<StorageConfig | null> {
  return (await db.collection(SETTINGS_COLLECTION).findOne({ _id: SETTINGS_ID as never }, { projection: { _id: 0 } })) as StorageConfig | null
}

export async function saveStorageConfig(db: Db, config: StorageConfig) {
  await db.collection(SETTINGS_COLLECTION).replaceOne({ _id: SETTINGS_ID as never }, config, { upsert: true })
}

export function storageStatus(config: StorageConfig | null): StorageStatus {
  const s3 = config?.s3
  return {
    provider: config?.provider ?? DEFAULT_STORAGE_PROVIDER,
    encryptionConfigured: isEncryptionConfigured(),
    updatedAt: config?.updatedAt || null,
    s3: s3
      ? {
          bucket: s3.bucket,
          region: s3.region,
          prefix: s3.prefix,
          endpoint: s3.endpoint,
          forcePathStyle: s3.forcePathStyle,
          accessKeyIdHint: s3.accessKeyIdHint,
        }
      : null,
  }
}

function normalizeEndpoint(raw: string | undefined): string {
  const value = raw?.trim() ?? ''
  if (!value) return ''
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new StorageError('The S3 endpoint must be a valid URL', 400)
  }
  if (url.protocol !== 'https:') throw new StorageError('The S3 endpoint must use https', 400)
  if (url.username || url.password || url.search || url.hash) throw new StorageError('The S3 endpoint must not contain credentials or query strings', 400)
  return url.origin + url.pathname.replace(/\/+$/, '')
}

/** Validates input, encrypts any new keys and returns the config to persist plus plaintext credentials for verification. */
export function buildStorageConfig(
  input: StorageConfigInput,
  previous: StorageConfig | null,
): { config: StorageConfig; credentials?: { accessKeyId: string; secretAccessKey: string } } {
  const updatedAt = new Date().toISOString()
  if (input.provider === 'mongodb-gridfs') return { config: { provider: 'mongodb-gridfs', s3: previous?.s3 ?? null, updatedAt } }
  if (input.provider !== 'aws-s3' || !input.s3) throw new StorageError('Invalid storage provider', 400)

  const s3 = input.s3
  const bucket = s3.bucket.trim()
  const region = s3.region.trim()
  const prefix = (s3.prefix ?? '').trim()
  if (!S3_BUCKET_PATTERN.test(bucket) || bucket.includes('..')) throw new StorageError('Enter a valid S3 bucket name', 400)
  if (!S3_REGION_PATTERN.test(region)) throw new StorageError('Enter a valid region, for example eu-west-1', 400)
  if (prefix.length > 200 || !S3_PREFIX_PATTERN.test(prefix)) throw new StorageError('The key prefix must be empty or end with "/" (letters, digits, -_.)', 400)
  const endpoint = normalizeEndpoint(s3.endpoint)

  const prev = previous?.s3
  const newId = s3.accessKeyId?.trim()
  const newSecret = s3.secretAccessKey?.trim()
  if (!!newId !== !!newSecret) throw new StorageError('Enter both the access key id and the secret access key', 400)

  let accessKeyId: string
  let secretAccessKey: string
  let encrypted: Pick<S3Config, 'accessKeyId' | 'secretAccessKey' | 'accessKeyIdHint'>
  if (newId && newSecret) {
    if (!/^[A-Za-z0-9]{16,128}$/.test(newId)) throw new StorageError('The access key id format is invalid', 400)
    if (newSecret.length < 16 || newSecret.length > 256 || /\s/.test(newSecret)) throw new StorageError('The secret access key format is invalid', 400)
    accessKeyId = newId
    secretAccessKey = newSecret
    encrypted = {
      accessKeyId: encryptSecret(newId, SECRET_CONTEXT.id),
      secretAccessKey: encryptSecret(newSecret, SECRET_CONTEXT.secret),
      accessKeyIdHint: keyHint(newId),
    }
  } else if (prev) {
    ;({ accessKeyId, secretAccessKey } = decryptCredentials(prev))
    encrypted = { accessKeyId: prev.accessKeyId, secretAccessKey: prev.secretAccessKey, accessKeyIdHint: prev.accessKeyIdHint }
  } else {
    throw new StorageError('Enter the S3 access key id and secret access key', 400)
  }

  return {
    config: { provider: 'aws-s3', s3: { bucket, region, prefix, endpoint, forcePathStyle: !!s3.forcePathStyle, ...encrypted }, updatedAt },
    credentials: { accessKeyId, secretAccessKey },
  }
}

function decryptCredentials(s3: S3Config) {
  try {
    return {
      accessKeyId: decryptSecret(s3.accessKeyId, SECRET_CONTEXT.id),
      secretAccessKey: decryptSecret(s3.secretAccessKey, SECRET_CONTEXT.secret),
    }
  } catch {
    throw new StorageError('The stored S3 keys could not be decrypted. Re-enter them in System Settings.', 503)
  }
}

function gridFsStore(): ObjectStore {
  const removeAll = async (key: string) => {
    const bucket = await getBucket()
    const files = await bucket.find({ filename: key }).toArray()
    await Promise.all(files.map((f) => bucket.delete(f._id)))
  }
  return {
    provider: 'mongodb-gridfs',
    async put(key, bytes, contentType) {
      await removeAll(key)
      const bucket = await getBucket()
      await pipeline(Readable.from(bytes), bucket.openUploadStream(key, { metadata: { contentType } }))
    },
    async get(key) {
      const bucket = await getBucket()
      const file = await bucket.find({ filename: key }).sort({ uploadDate: -1 }).limit(1).next()
      if (!file) return null
      const chunks: Buffer[] = []
      for await (const chunk of bucket.openDownloadStream(file._id)) chunks.push(chunk as Buffer)
      return { bytes: Buffer.concat(chunks), contentType: (file.metadata?.contentType as string) || 'application/octet-stream' }
    },
    delete: removeAll,
  }
}

function s3Client(s3: Omit<S3Config, 'accessKeyId' | 'secretAccessKey' | 'accessKeyIdHint'>, credentials: { accessKeyId: string; secretAccessKey: string }) {
  return new S3Client({
    region: s3.region,
    endpoint: s3.endpoint || undefined,
    forcePathStyle: s3.forcePathStyle,
    credentials,
    maxAttempts: 2,
  })
}

function s3Store(s3: S3Config, credentials = decryptCredentials(s3)): ObjectStore {
  const client = s3Client(s3, credentials)
  const Key = (key: string) => `${s3.prefix}${key}`
  return {
    provider: 'aws-s3',
    async put(key, bytes, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: s3.bucket,
          Key: Key(key),
          Body: bytes,
          ContentType: contentType,
          ...(s3.endpoint ? {} : { ServerSideEncryption: 'AES256' as const }),
        }),
      )
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: Key(key) }))
        if (!result.Body) return null
        return { bytes: Buffer.from(await result.Body.transformToByteArray()), contentType: result.ContentType || 'application/octet-stream' }
      } catch (error) {
        if (error instanceof NoSuchKey || (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)) return null
        throw error
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: Key(key) }))
    },
  }
}

export function describeS3Error(error: unknown): string {
  if (error instanceof S3ServiceException) {
    const status = error.$metadata.httpStatusCode
    if (error.name === 'NoSuchBucket') return 'The bucket does not exist in that region or endpoint'
    if (error.name === 'InvalidAccessKeyId' || error.name === 'SignatureDoesNotMatch') return 'S3 rejected the access keys'
    if (status === 403 || error.name === 'AccessDenied') return 'Access denied. The keys need s3:PutObject, s3:GetObject and s3:DeleteObject on this bucket'
    if (error.name === 'PermanentRedirect' || status === 301) return 'The bucket is in a different region'
    return `${error.name}: ${error.message}`
  }
  return (error as Error).message || 'Unknown S3 error'
}

/** Round-trips a small probe object so a misconfigured bucket is caught before uploads are routed to it. */
export async function verifyS3(config: StorageConfig, credentials: { accessKeyId: string; secretAccessKey: string }) {
  if (!config.s3) throw new StorageError('S3 is not configured', 400)
  const store = s3Store(config.s3, credentials)
  const probeKey = `obj/${'0'.repeat(24)}${Date.now().toString(16).padStart(8, '0').slice(-8)}`
  try {
    const payload = Buffer.from('atlas-document-hub storage check')
    await store.put(probeKey, payload, 'text/plain')
    const read = await store.get(probeKey)
    if (!read || !read.bytes.equals(payload)) throw new StorageError('The probe object could not be read back from S3', 502)
    await store.delete(probeKey)
  } catch (error) {
    if (error instanceof StorageError) throw error
    throw new StorageError(`S3 check failed: ${describeS3Error(error)}`, 502)
  }
}

export async function getObjectStores(db: Db): Promise<{ active: ObjectStore; fallback: ObjectStore | null }> {
  const config = await loadStorageConfig(db)
  const gridfs = gridFsStore()
  if (config?.provider === 'aws-s3' && config.s3) return { active: s3Store(config.s3), fallback: gridfs }
  return { active: gridfs, fallback: config?.s3 ? safeS3Store(config.s3) : null }
}

function safeS3Store(s3: S3Config): ObjectStore | null {
  try {
    return s3Store(s3)
  } catch {
    return null
  }
}

/** Best-effort removal of every object this app wrote under the configured S3 prefix. */
export async function purgeS3Objects(db: Db): Promise<number> {
  const config = await loadStorageConfig(db)
  if (!config?.s3) return 0
  const client = s3Client(config.s3, decryptCredentials(config.s3))
  let removed = 0
  let token: string | undefined
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: config.s3.bucket, Prefix: `${config.s3.prefix}obj/`, ContinuationToken: token }),
    )
    const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! })).filter((o) => o.Key)
    if (keys.length) {
      await client.send(new DeleteObjectsCommand({ Bucket: config.s3.bucket, Delete: { Objects: keys, Quiet: true } }))
      removed += keys.length
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return removed
}
