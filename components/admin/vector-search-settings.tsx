'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import Banner from '@leafygreen-ui/banner'
import { Body, H3 } from '@leafygreen-ui/typography'
import { VectorSearchPanel } from '@/components/setup/vector-search-panel'
import { useToast } from '@/components/shared/toast'
import { enableVectorSearch } from '@/lib/demo/services'
import { useDemoState } from '@/lib/demo/store'
import { embedChunks, fetchVectorStatus, initVectorSearch } from '@/lib/demo/vector'

export function VectorSearchSettings() {
  const state = useDemoState()
  const { pushToast } = useToast()
  const { data, error, isLoading, mutate } = useSWR('vector-status', fetchVectorStatus, {
    revalidateOnFocus: false,
    refreshInterval: (latest) => (latest?.index && !latest.index.queryable ? 4000 : 0),
  })
  const [initializing, setInitializing] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const enabled = state.setup?.embeddingMode === 'voyage'
  const pending = data ? data.chunks.total - data.chunks.embedded : 0

  const initialize = async () => {
    setInitializing(true)
    try {
      await mutate(await initVectorSearch(), { revalidate: false })
      await enableVectorSearch()
      pushToast({ variant: 'success', title: 'Vector search initialized', description: 'New uploads are embedded with Voyage AI.' })
    } catch (e) {
      pushToast({ variant: 'warning', title: 'Vector search failed', description: (e as Error).message })
    } finally {
      setInitializing(false)
    }
  }

  const backfill = async () => {
    setBackfilling(true)
    try {
      if (!enabled) await enableVectorSearch()
      let total = 0
      for (let batch = 0; batch < 50; batch++) {
        const result = await embedChunks()
        total += result.embedded
        if (!result.remaining || !result.embedded) break
      }
      await mutate()
      pushToast({ variant: 'success', title: 'Backfill complete', description: `${total} chunk(s) embedded.` })
    } catch (e) {
      pushToast({ variant: 'warning', title: 'Backfill failed', description: (e as Error).message })
    } finally {
      setBackfilling(false)
    }
  }

  const ready = !!data?.voyageConfigured && !!data.index

  return (
    <Card className="flex flex-col gap-3 xl:col-span-2">
      <H3>Vector search</H3>
      <VectorSearchPanel status={data} loading={isLoading} error={error as Error | undefined} initializing={initializing} onInitialize={() => void initialize()} />
      {ready && !enabled && (
        <Banner variant="info">
          The index exists but this tenant has embeddings disabled.{' '}
          <Button size="xsmall" onClick={() => void enableVectorSearch().then(() => mutate())}>
            Enable for tenant
          </Button>
        </Banner>
      )}
      {ready && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="small" onClick={() => void backfill()} disabled={backfilling || pending === 0}>
            {backfilling ? 'Embedding...' : `Embed pending chunks (${pending})`}
          </Button>
          <Body className="text-xs text-muted">Embeds chunks uploaded before vector search was initialized or whose embedding failed.</Body>
        </div>
      )}
    </Card>
  )
}
