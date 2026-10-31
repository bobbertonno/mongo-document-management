'use client'

import { useState } from 'react'
import Button from '@leafygreen-ui/button'
import Badge from '@leafygreen-ui/badge'
import Icon from '@leafygreen-ui/icon'
import TextInput from '@leafygreen-ui/text-input'
import Checkbox from '@leafygreen-ui/checkbox'
import { Body } from '@leafygreen-ui/typography'
import { describeStorage } from '@/lib/demo/storage'
import {
  DEFAULT_STORAGE_PROVIDER,
  STORAGE_PROVIDERS,
  type ObjectStorageProviderId,
  type StorageConfigInput,
  type StorageStatus,
} from '@/lib/domain/storage'

interface StoragePanelProps {
  status: StorageStatus | undefined
  loading: boolean
  error?: Error
  saving: boolean
  onSave: (config: StorageConfigInput) => void
}

export function StoragePanel({ status, loading, error, saving, onSave }: StoragePanelProps) {
  const saved = status?.s3
  const [provider, setProvider] = useState<ObjectStorageProviderId>(status?.provider ?? DEFAULT_STORAGE_PROVIDER)
  const [form, setForm] = useState({
    bucket: saved?.bucket ?? '',
    region: saved?.region ?? '',
    prefix: saved?.prefix ?? '',
    endpoint: saved?.endpoint ?? '',
    forcePathStyle: saved?.forcePathStyle ?? false,
    accessKeyId: '',
    secretAccessKey: '',
  })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const isS3 = provider === 'aws-s3'
  const enteringKeys = !!form.accessKeyId.trim() || !!form.secretAccessKey.trim()
  const hasKeys = !!saved?.accessKeyIdHint || (!!form.accessKeyId.trim() && !!form.secretAccessKey.trim())
  const missing = isS3 && (!form.bucket.trim() || !form.region.trim() || !hasKeys)
  const encryptionMissing = isS3 && status?.encryptionConfigured === false
  const unchanged =
    !!status &&
    status.provider === provider &&
    (!isS3 ||
      (!enteringKeys &&
        saved?.bucket === form.bucket.trim() &&
        saved.region === form.region.trim() &&
        saved.prefix === form.prefix.trim() &&
        saved.endpoint === form.endpoint.trim() &&
        saved.forcePathStyle === form.forcePathStyle))

  const statusText = loading
    ? 'Checking storage settings...'
    : error
      ? error.message
      : `New uploads are stored in ${describeStorage(status)}.`

  const submit = () =>
    onSave(
      isS3
        ? {
            provider,
            s3: {
              bucket: form.bucket.trim(),
              region: form.region.trim(),
              prefix: form.prefix.trim(),
              endpoint: form.endpoint.trim(),
              forcePathStyle: form.forcePathStyle,
              accessKeyId: form.accessKeyId.trim() || undefined,
              secretAccessKey: form.secretAccessKey.trim() || undefined,
            },
          }
        : { provider },
    )

  return (
    <section aria-labelledby="storage-heading" className="flex flex-col gap-4 rounded-lg border-2 border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon glyph="Folder" className="text-mdb-green" />
          <span className="flex flex-col gap-1">
            <strong id="storage-heading" className="text-sm">
              Binary storage
            </strong>
            <span className="text-xs text-muted" role="status" aria-live="polite">
              {statusText}
            </span>
          </span>
        </div>
        <Badge variant={status?.provider === 'aws-s3' ? 'blue' : 'green'}>
          {status?.provider === 'aws-s3' ? 'Amazon S3' : 'GridFS'}
        </Badge>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-semibold">Storage provider</legend>
        {STORAGE_PROVIDERS.map((p) => {
          const checked = p.id === provider
          return (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${checked ? 'border-mdb-green bg-mdb-green/5' : 'border-border'}`}
            >
              <input
                type="radio"
                name="storage-provider"
                value={p.id}
                checked={checked}
                onChange={() => setProvider(p.id)}
                className="mt-1 accent-[var(--color-mdb-green,#00684A)]"
              />
              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {p.label}
                  {p.id === DEFAULT_STORAGE_PROVIDER && <Badge variant="green">Default</Badge>}
                  {p.id === 'aws-s3' && saved?.accessKeyIdHint && <Badge variant="lightgray">Key {saved.accessKeyIdHint}</Badge>}
                </span>
                <span className="text-xs text-muted">{p.description}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      {isS3 && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Bucket name" placeholder="acme-documents" value={form.bucket} onChange={(e) => set('bucket', e.target.value)} />
            <TextInput label="Region" placeholder="eu-west-1" value={form.region} onChange={(e) => set('region', e.target.value)} />
            <TextInput
              label="Access key id"
              description={saved?.accessKeyIdHint ? `Stored encrypted (${saved.accessKeyIdHint}). Leave both keys blank to keep them.` : 'Encrypted with AES-256-GCM before it is stored in Atlas.'}
              autoComplete="off"
              placeholder="AKIA..."
              value={form.accessKeyId}
              onChange={(e) => set('accessKeyId', e.target.value)}
            />
            <TextInput
              label="Secret access key"
              type="password"
              autoComplete="off"
              placeholder={saved?.accessKeyIdHint ? '••••••••' : ''}
              value={form.secretAccessKey}
              onChange={(e) => set('secretAccessKey', e.target.value)}
            />
            <TextInput
              label="Key prefix (optional)"
              description='Folder inside the bucket, ending with "/".'
              placeholder="atlas-document-hub/"
              value={form.prefix}
              onChange={(e) => set('prefix', e.target.value)}
            />
            <TextInput
              label="Custom endpoint (optional)"
              description="For S3-compatible services such as MinIO or Cloudflare R2. HTTPS only."
              placeholder="https://s3.example.com"
              value={form.endpoint}
              onChange={(e) => set('endpoint', e.target.value)}
            />
          </div>
          <Checkbox
            label="Use path-style addressing"
            description="Required by most S3-compatible services with a custom endpoint."
            checked={form.forcePathStyle}
            onChange={(e) => set('forcePathStyle', e.target.checked)}
          />
          <Body className="text-xs text-muted">
            The keys need s3:PutObject, s3:GetObject, s3:DeleteObject and s3:ListBucket on this bucket. Saving writes and deletes a
            small probe object to verify access.
          </Body>
        </div>
      )}

      {status?.provider && status.provider !== provider && (
        <Body className="text-xs text-muted">
          Only new uploads use the new provider. Existing files stay where they are and remain readable.
        </Body>
      )}
      {encryptionMissing && (
        <Body className="text-xs text-red-700">SETTINGS_ENCRYPTION_KEY is not set on the server, so S3 keys cannot be stored yet.</Body>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="small" variant="primary" onClick={submit} disabled={saving || loading || unchanged || missing || encryptionMissing}>
          {saving ? (isS3 ? 'Verifying bucket...' : 'Saving...') : 'Save storage settings'}
        </Button>
        <Body className="text-xs text-muted">
          {missing ? 'Enter the bucket, region and access keys.' : 'You can change this later in System Settings.'}
        </Body>
      </div>
    </section>
  )
}
