'use client'

import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import { Body, H3 } from '@leafygreen-ui/typography'
import { PageHeader } from '@/components/shell/page-header'
import useSWR from 'swr'
import { fetchAtlasStatus, useDemoState } from '@/lib/demo/store'

type Health = 'healthy' | 'degraded' | 'not configured'
const VARIANT: Record<Health, 'green' | 'yellow' | 'lightgray'> = { healthy: 'green', degraded: 'yellow', 'not configured': 'lightgray' }

export function SystemHealth() {
  const s = useDemoState()
  const pending = s.outboxEvents.filter((e) => !e.publishedAt).length
  const failedRuns = s.generationRuns.filter((r) => r.status === 'failed').length
  const unindexed = s.documentVersions.filter((v) => v.pipeline.some((p) => p.step === 'search_indexing' && p.status !== 'succeeded')).length

  const { data: atlas } = useSWR('atlas-status', fetchAtlasStatus, { refreshInterval: 30000 })
  const atlasHealth: Health = !atlas ? 'degraded' : atlas.connected ? 'healthy' : atlas.configured ? 'degraded' : 'not configured'
  const components: { name: string; status: Health; detail: string }[] = [
    {
      name: 'Metadata store',
      status: atlasHealth,
      detail: `MongoDB Atlas - ${s.documents.length} documents, ${s.documentVersions.length} versions`,
    },
    { name: 'Object storage', status: atlasHealth, detail: 'MongoDB GridFS bucket with checksum verification' },
    { name: 'Search index', status: unindexed ? 'degraded' : 'healthy', detail: `${s.documentChunks.length} chunks indexed, ${unindexed} versions not indexed` },
    { name: 'Embeddings', status: 'not configured', detail: 'Semantic search unavailable until a provider is configured' },
    { name: 'Event streaming', status: 'not configured', detail: `${pending} outbox events pending publication` },
    { name: 'Generator workers', status: failedRuns ? 'degraded' : 'healthy', detail: `${s.generationRuns.length} runs, ${failedRuns} failed` },
    {
      name: 'MongoDB Atlas',
      status: atlasHealth,
      detail: !atlas
        ? 'Checking connection...'
        : atlas.connected
          ? `Connected to "${atlas.database}" (${atlas.latencyMs} ms) - transactional commits across collections`
          : (atlas.error ?? 'Cluster unreachable'),
    },
  ]

  return (
    <>
      <PageHeader title="System Health" description="Live status derived from the current data store." />
      <Card className="!p-0">
        <ul className="divide-y divide-border">
          {components.map((c) => (
            <li key={c.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <H3 className="!text-sm">{c.name}</H3>
                <Body className="text-xs text-muted">{c.detail}</Body>
              </div>
              <Badge variant={VARIANT[c.status]}>{c.status}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
