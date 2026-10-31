'use client'

import { useMemo, useState } from 'react'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import { Body, H3 } from '@leafygreen-ui/typography'
import { PageHeader } from '@/components/shell/page-header'
import { EngineNote } from '@/components/shared/badges'
import { useDemoState } from '@/lib/demo/store'
import { formatDateTime } from '@/lib/demo/util'
import { cn } from '@/lib/utils'

export function TopicExplorer() {
  const state = useDemoState()
  const topics = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of state.outboxEvents) m.set(e.topic, (m.get(e.topic) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [state.outboxEvents])
  const [selected, setSelected] = useState<string | null>(null)
  const active = selected ?? topics[0]?.[0] ?? null
  const events = useMemo(() => state.outboxEvents.filter((e) => e.topic === active).reverse().slice(0, 100), [state.outboxEvents, active])

  return (
    <>
      <PageHeader title="Topic Explorer" description="Transactional outbox events, grouped by topic, awaiting Kafka publication." />
      {topics.length === 0 ? (
        <Card>
          <Body className="text-muted">No events yet. Upload or generate documents to produce outbox events.</Body>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-4">
          <Card className="!p-2">
            <ul className="flex flex-col" aria-label="Topics">
              {topics.map(([topic, count]) => (
                <li key={topic}>
                  <button
                    type="button"
                    onClick={() => setSelected(topic)}
                    aria-current={active === topic}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-mono text-xs',
                      active === topic ? 'bg-[#e3fcf7] text-foreground' : 'hover:bg-background',
                    )}
                  >
                    {topic}
                    <span className="tabular-nums text-muted">{count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="!p-0 xl:col-span-3">
            <div className="border-b border-border px-4 py-3">
              <H3 className="font-mono">{active}</H3>
            </div>
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e._id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2">
                      <span className="font-mono">key={e.key}</span>
                      <Badge variant={e.publishedAt ? 'green' : 'yellow'}>{e.publishedAt ? 'published' : 'pending'}</Badge>
                    </span>
                    <span className="text-muted">{formatDateTime(e.createdAt)}</span>
                  </div>
                  <code className="break-all font-mono text-[11px] text-muted">{JSON.stringify(e.payload)}</code>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      <div className="mt-3">
        <EngineNote>No Kafka broker configured. Events stay in the outbox with publishedAt = null.</EngineNote>
      </div>
    </>
  )
}
