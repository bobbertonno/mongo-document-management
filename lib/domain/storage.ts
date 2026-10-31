export type ObjectStorageProviderId = 'mongodb-gridfs' | 'aws-s3'

export const DEFAULT_STORAGE_PROVIDER: ObjectStorageProviderId = 'mongodb-gridfs'

export const STORAGE_PROVIDERS: { id: ObjectStorageProviderId; label: string; description: string }[] = [
  {
    id: 'mongodb-gridfs',
    label: 'MongoDB GridFS',
    description: 'Files are stored in the same Atlas cluster as their metadata. No extra credentials required.',
  },
  {
    id: 'aws-s3',
    label: 'Amazon S3 (or S3-compatible)',
    description: 'Files are stored in your own bucket. Access keys are encrypted before they are saved in Atlas.',
  },
]

export interface S3SettingsInput {
  bucket: string
  region: string
  prefix?: string
  endpoint?: string
  forcePathStyle?: boolean
  accessKeyId?: string
  secretAccessKey?: string
}

export interface StorageConfigInput {
  provider: ObjectStorageProviderId
  s3?: S3SettingsInput
}

export interface StorageStatus {
  provider: ObjectStorageProviderId
  encryptionConfigured: boolean
  updatedAt: string | null
  s3: {
    bucket: string
    region: string
    prefix: string
    endpoint: string
    forcePathStyle: boolean
    accessKeyIdHint: string
  } | null
}

export const S3_BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/
export const S3_REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d$|^auto$|^[a-z0-9-]{2,32}$/
export const S3_PREFIX_PATTERN = /^([A-Za-z0-9!_.*'()-]+\/)*$/
