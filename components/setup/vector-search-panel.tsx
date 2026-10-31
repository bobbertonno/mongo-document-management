'use client'

import Button from '@leafygreen-ui/button'
import Badge from '@leafygreen-ui/badge'
import Icon from '@leafygreen-ui/icon'
import { Body } from '@leafygreen-ui/typography'
import type { VectorStatus } from '@/lib/demo/vector'

interface VectorSearchPanelProps {
  status: VectorStatus | undefined
  loading: boolean
  error?: Error
  initializing: boolean
  onInitialize: () => void
}

export function VectorSearchPanel({ status, loading, error, initializing, onInitialize }: VectorSearchPanelProps) {
  const index = status?.index
  const ready = !!status?.voyageConfigured && !!index
  const badge = ready
    ? index.queryable
      ? { variant: 'green' as const, label: 'Ready' }
      : { variant: 'yellow' as const, label: `Index ${index.status.toLowerCase()}` }
    : { variant: 'lightgray' as const, label: 'Not initialized' }

  const description = loading
    ? 'Checking Voyage AI and Atlas Vector Search...'
    : error
      ? error.message
      : !status?.voyageConfigured
        ? 'VOYAGE_API_KEY is not set. Add it in the project environment variables to enable semantic and hybrid search.'
        : !index
          ? `Creates the "document_chunks_vector" index (${status.dimensions} dims, cosine, tenant filter). Chunks are embedded with ${status.model} on upload.`
          : index.queryable
            ? `Index "${index.name}" is queryable. ${status.chunks.embedded}/${status.chunks.total} chunks embedded with ${status.model}.`
            : `Index "${index.name}" is building in Atlas. You can finish setup now; search becomes available once it is queryable.`

  return (
    <section
      aria-labelledby="vector-search-heading"
      className={`flex flex-col gap-3 rounded-lg border-2 p-4 ${ready ? 'border-mdb-green' : 'border-border'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon glyph="Sparkle" className={ready ? 'text-mdb-green' : 'text-muted'} />
          <span className="flex flex-col gap-1">
            <strong id="vector-search-heading" className="text-sm">
              Semantic search (Voyage AI + Atlas Vector Search)
            </strong>
            <span className="text-xs text-muted" role="status" aria-live="polite">
              {description}
            </span>
          </span>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      {!ready && (
        <div className="flex items-center gap-3">
          <Button size="small" variant="primary" onClick={onInitialize} disabled={initializing || loading || !status?.voyageConfigured}>
            {initializing ? 'Initializing...' : 'Initialize vector search'}
          </Button>
          <Body className="text-xs text-muted">Optional. You can also initialize it later from System Settings.</Body>
        </div>
      )}
    </section>
  )
}
