'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import { Body, H3 } from '@leafygreen-ui/typography'
import { VectorSearchPanel } from '@/components/setup/vector-search-panel'
import { useToast } from '@/components/shared/toast'
import { enableVectorSearch } from '@/lib/demo/services'
import { embedChunks, embeddingModeFor, fetchVectorStatus, initVectorSearch } from '@/lib/demo/vector'
import type { EmbeddingConfigInput } from '@/lib/domain/embedding'

export function VectorSearchSettings() {
  const { pushToast } = useToast()
  const { data, error, isLoading, mutate } = useSWR('vector-status', fetchVectorStatus, {
    revalidateOnFocus: false,
    refreshInterval: (latest) => (latest?.index && !latest.index.queryable ? 4000 : 0),
  })
  const [saving, setSaving] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const pending = data && !data.automated ? data.chunks.total - data.chunks.embedded : 0

  const backfill = async () => {
    setBackfilling(true)
    try {
      let total = 0
      for (let batch = 0; batch < 50; batch++) {
        const result = await embedChunks()
        total += result.embedded
        if (result.automated || !result.remaining || !result.embedded) break
      }
      await mutate()
      pushToast({ variant: 'success', title: 'Backfill complete', description: `${total} chunk(s) embedded.` })
    } catch (e) {
      pushToast({ variant: 'warning', title: 'Backfill failed', description: (e as Error).message })
    } finally {
      setBackfilling(false)
    }
  }

  const save = async (config: EmbeddingConfigInput) => {
    setSaving(true)
    try {
      const status = await initVectorSearch(config)
      await mutate(status, { revalidate: false })
      await enableVectorSearch(embeddingModeFor(status), { provider: status.provider, model: status.model })
      pushToast({
        variant: 'success',
        title: 'Embedding settings saved',
        description: status.automated ? `Atlas embeds chunks automatically with ${status.model}.` : `Chunks are embedded with ${status.model}.`,
      })
    } catch (e) {
      pushToast({ variant: 'warning', title: 'Could not save embedding settings', description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="flex flex-col gap-3 xl:col-span-2">
      <H3>Vector search</H3>
      {data || error ? (
        <VectorSearchPanel
          key={data ? `${data.provider}:${data.model}` : 'error'}
          status={data}
          loading={isLoading}
          error={error as Error | undefined}
          saving={saving}
          onSave={(config) => void save(config)}
        />
      ) : (
        <Body className="text-sm text-muted">Loading vector search status...</Body>
      )}
      {pending > 0 && data?.index && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="small" onClick={() => void backfill()} disabled={backfilling}>
            {backfilling ? 'Embedding...' : `Embed pending chunks (${pending})`}
          </Button>
          <Body className="text-xs text-muted">Embeds chunks uploaded before this provider was configured or whose embedding failed.</Body>
        </div>
      )}
    </Card>
  )
}
