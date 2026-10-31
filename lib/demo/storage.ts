'use client'

import type { StorageConfigInput, StorageStatus } from '@/lib/domain/storage'

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`)
  return body as T
}

export async function fetchStorageStatus(): Promise<StorageStatus> {
  return readJson<StorageStatus>(await fetch('/api/atlas/storage', { cache: 'no-store' }))
}

export async function saveStorageSettings(config: StorageConfigInput): Promise<StorageStatus> {
  return readJson<StorageStatus>(
    await fetch('/api/atlas/storage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(config) }),
  )
}

export function describeStorage(status: StorageStatus | undefined): string {
  if (!status || status.provider === 'mongodb-gridfs' || !status.s3) return 'MongoDB GridFS bucket'
  return `Amazon S3 s3://${status.s3.bucket}/${status.s3.prefix} (${status.s3.region}${status.s3.endpoint ? `, ${new URL(status.s3.endpoint).host}` : ''})`
}
