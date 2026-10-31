'use client'

import { useState } from 'react'
import Button from '@leafygreen-ui/button'
import Badge from '@leafygreen-ui/badge'
import Icon from '@leafygreen-ui/icon'
import TextInput from '@leafygreen-ui/text-input'
import { Option, Select } from '@leafygreen-ui/select'
import { Body } from '@leafygreen-ui/typography'
import type { VectorStatus } from '@/lib/demo/vector'
import {
  DEFAULT_EMBEDDING_PROVIDER,
  EMBEDDING_PROVIDERS,
  getProviderOption,
  type EmbeddingConfigInput,
  type EmbeddingProviderId,
} from '@/lib/domain/embedding'

interface VectorSearchPanelProps {
  status: VectorStatus | undefined
  loading: boolean
  error?: Error
  saving: boolean
  onSave: (config: EmbeddingConfigInput) => void
}

export function VectorSearchPanel({ status, loading, error, saving, onSave }: VectorSearchPanelProps) {
  const [provider, setProvider] = useState<EmbeddingProviderId>(status?.configured ? status.provider : DEFAULT_EMBEDDING_PROVIDER)
  const [models, setModels] = useState<Partial<Record<EmbeddingProviderId, string>>>(
    status?.configured ? { [status.provider]: status.model } : {},
  )
  const [apiKey, setApiKey] = useState('')

  const option = getProviderOption(provider)
  const model = models[provider] ?? option.defaultModel
  const storedHint = status?.keyHints[provider]
  const needsKey = option.requiresApiKey && !storedHint && !apiKey.trim()
  const encryptionMissing = option.requiresApiKey && !!apiKey.trim() && status?.encryptionConfigured === false

  const index = status?.index
  const active = !!status?.configured && !!index
  const unchanged = active && status.provider === provider && status.model === model && !apiKey.trim()
  const badge = active
    ? index.queryable
      ? { variant: 'green' as const, label: 'Ready' }
      : { variant: 'yellow' as const, label: `Index ${index.status.toLowerCase()}` }
    : { variant: 'lightgray' as const, label: 'Not initialized' }

  const statusText = loading
    ? 'Checking Atlas Vector Search...'
    : error
      ? error.message
      : !active
        ? 'Choose how chunks are embedded, then initialize the vector index.'
        : index.queryable
          ? `Index "${index.name}" is queryable with ${status.model}${status.automated ? ' (Atlas automated embedding)' : ` (${status.chunks.embedded}/${status.chunks.total} chunks embedded)`}.`
          : `Index "${index.name}" is building in Atlas. Search becomes available once it is queryable.`

  const submit = () => onSave({ provider, model, apiKey: option.requiresApiKey && apiKey.trim() ? apiKey.trim() : undefined })

  return (
    <section
      aria-labelledby="vector-search-heading"
      className={`flex flex-col gap-4 rounded-lg border-2 p-4 ${active ? 'border-mdb-green' : 'border-border'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon glyph="Sparkle" className={active ? 'text-mdb-green' : 'text-muted'} />
          <span className="flex flex-col gap-1">
            <strong id="vector-search-heading" className="text-sm">
              Semantic search (Atlas Vector Search)
            </strong>
            <span className="text-xs text-muted" role="status" aria-live="polite">
              {statusText}
            </span>
          </span>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-semibold">Embedding model provider</legend>
        {EMBEDDING_PROVIDERS.map((p) => {
          const checked = p.id === provider
          return (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${checked ? 'border-mdb-green bg-mdb-green/5' : 'border-border'}`}
            >
              <input
                type="radio"
                name="embedding-provider"
                value={p.id}
                checked={checked}
                onChange={() => setProvider(p.id)}
                className="mt-1 accent-[var(--color-mdb-green,#00684A)]"
              />
              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {p.label}
                  {p.id === DEFAULT_EMBEDDING_PROVIDER && <Badge variant="green">Default</Badge>}
                  {p.requiresApiKey && status?.keyHints[p.id] && <Badge variant="lightgray">Key {status.keyHints[p.id]}</Badge>}
                </span>
                <span className="text-xs text-muted">{p.description}</span>
              </span>
            </label>
          )
        })}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Model"
          value={model}
          onChange={(value: string) => setModels((m) => ({ ...m, [provider]: value }))}
          allowDeselect={false}
        >
          {option.models.map((m) => (
            <Option key={m.id} value={m.id}>
              {`${m.label} · ${m.dimensions} dims`}
            </Option>
          ))}
        </Select>
        {option.requiresApiKey && (
          <TextInput
            label={`${option.label.replace(' (your API key)', '')} API key`}
            description={storedHint ? `Stored encrypted (${storedHint}). Leave blank to keep it.` : 'Encrypted with AES-256-GCM before it is stored in Atlas.'}
            type="password"
            autoComplete="off"
            placeholder={option.keyPlaceholder}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        )}
      </div>

      {provider !== DEFAULT_EMBEDDING_PROVIDER && (
        <Body className="text-xs text-muted">
          Atlas automated embedding is not available with custom models. This app embeds every chunk and query itself, and
          switching providers re-embeds existing chunks.
        </Body>
      )}
      {encryptionMissing && (
        <Body className="text-xs text-red-700">
          SETTINGS_ENCRYPTION_KEY is not set on the server, so API keys cannot be stored yet.
        </Body>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="small"
          variant="primary"
          onClick={submit}
          disabled={saving || loading || unchanged || needsKey || encryptionMissing}
        >
          {saving ? 'Saving...' : active ? 'Save embedding settings' : 'Initialize vector search'}
        </Button>
        <Body className="text-xs text-muted">
          {needsKey ? 'Enter an API key to use this provider.' : 'You can change this later in System Settings.'}
        </Body>
      </div>
    </section>
  )
}
