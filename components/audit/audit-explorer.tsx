'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import { SearchInput } from '@leafygreen-ui/search-input'
import { Option, Select } from '@leafygreen-ui/select'
import { Body } from '@leafygreen-ui/typography'
import { PageHeader } from '@/components/shell/page-header'
import { EngineNote } from '@/components/shared/badges'
import { useDemoState } from '@/lib/demo/store'
import { downloadBlob, formatDateTime } from '@/lib/demo/util'

const ALL = '__all'
const PAGE = 50

export function AuditExplorer({ variant }: { variant: 'audit' | 'activity' }) {
  const state = useDemoState()
  const [q, setQ] = useState('')
  const [action, setAction] = useState(ALL)
  const [result, setResult] = useState(ALL)
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)

  const actions = useMemo(() => Array.from(new Set(state.auditEvents.map((e) => e.action))).sort(), [state.auditEvents])
  const titles = useMemo(() => new Map(state.documents.map((d) => [d._id, d.title])), [state.documents])

  const events = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...state.auditEvents]
      .reverse()
      .filter(
        (e) =>
          (action === ALL || e.action === action) &&
          (result === ALL || e.result === result) &&
          (!needle || e.resourceId.toLowerCase().includes(needle) || e.correlationId.toLowerCase().includes(needle) || (titles.get(e.resourceId) ?? '').toLowerCase().includes(needle)),
      )
  }, [state.auditEvents, q, action, result, titles])

  const exportJson = () => downloadBlob(new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' }), 'audit-events.json')

  const isAudit = variant === 'audit'
  return (
    <>
      <PageHeader
        title={isAudit ? 'Audit Explorer' : 'Activity Feed'}
        description={isAudit ? 'Append-only record of every read, write and denial.' : 'Recent activity across your tenant.'}
        actions={isAudit ? <Button onClick={exportJson}>Export JSON</Button> : undefined}
      />
      {isAudit && (
        <Card className="mb-4 !p-4">
          <div className="grid gap-3 md:grid-cols-3 md:items-end">
            <SearchInput aria-label="Filter by resource, title or correlation id" placeholder="Resource, title or correlation id" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select label="Action" size="small" value={action} onChange={setAction}>
              <Option value={ALL}>All actions</Option>
              {actions.map((a) => (
                <Option key={a} value={a}>
                  {a}
                </Option>
              ))}
            </Select>
            <Select label="Result" size="small" value={result} onChange={setResult}>
              <Option value={ALL}>All results</Option>
              <Option value="success">success</Option>
              <Option value="failure">failure</Option>
              <Option value="denied">denied</Option>
            </Select>
          </div>
        </Card>
      )}
      <Card className="!p-0">
        {events.length === 0 ? (
          <Body className="p-6 text-muted">No events recorded.</Body>
        ) : (
          <ul className="divide-y divide-border">
            {events.slice(0, limit).map((e) => {
              const title = titles.get(e.resourceId)
              const expanded = open === e.eventId
              return (
                <li key={e.eventId} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{e.action}</span>
                      <Badge variant={e.result === 'success' ? 'green' : e.result === 'denied' ? 'yellow' : 'red'}>{e.result}</Badge>
                      {title ? (
                        <Link href={`/documents/${e.resourceId}`} className="truncate hover:underline">
                          {title}
                        </Link>
                      ) : (
                        <span className="truncate font-mono text-xs text-muted">{e.resourceId}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      {e.actorType}
                      <time dateTime={e.occurredAt}>{formatDateTime(e.occurredAt)}</time>
                      {isAudit && (
                        <button
                          type="button"
                          className="font-medium text-mdb-green hover:underline"
                          aria-expanded={expanded}
                          onClick={() => setOpen(expanded ? null : e.eventId)}
                        >
                          {expanded ? 'Hide' : 'Details'}
                        </button>
                      )}
                    </span>
                  </div>
                  {expanded && (
                    <pre className="mt-2 overflow-auto rounded-md bg-[#001e2b] p-3 font-mono text-[11px] leading-relaxed text-[#e3fcf7]">
                      {JSON.stringify(e, null, 2)}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {events.length > limit && (
          <div className="border-t border-border p-3 text-center">
            <Button size="small" onClick={() => setLimit(limit + PAGE)}>
              Load more ({events.length - limit} remaining)
            </Button>
          </div>
        )}
      </Card>
      <div className="mt-3">
        <EngineNote>Audit events are written in the same commit as the change they describe.</EngineNote>
      </div>
    </>
  )
}
