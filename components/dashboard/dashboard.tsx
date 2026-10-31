'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import Card from '@leafygreen-ui/card'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import { Body, H3, Overline } from '@leafygreen-ui/typography'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '@/components/shell/page-header'
import { ClassificationBadge, EngineNote } from '@/components/shared/badges'
import { useDemoState } from '@/lib/demo/store'
import { formatBytes, formatDateTime } from '@/lib/demo/util'
import { DEPARTMENTS } from '@/lib/domain/types'

export function Dashboard() {
  const state = useDemoState()

  const stats = useMemo(() => {
    const active = state.documents.filter((d) => !d.deletedAt)
    const bytes = state.documentVersions.reduce((s, v) => s + v.fileSize, 0)
    return {
      documents: active.length,
      versions: state.documentVersions.length,
      chunks: state.documentChunks.length,
      storage: formatBytes(bytes),
      audit: state.auditEvents.length,
      outbox: state.outboxEvents.length,
      byDept: DEPARTMENTS.map((d) => ({ department: d, documents: active.filter((x) => x.department === d).length })),
      recent: [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
      activity: [...state.auditEvents].reverse().slice(0, 8),
    }
  }, [state])

  const tiles = [
    { label: 'Active documents', value: stats.documents.toLocaleString() },
    { label: 'Versions', value: stats.versions.toLocaleString() },
    { label: 'Indexed chunks', value: stats.chunks.toLocaleString() },
    { label: 'Stored binaries', value: stats.storage },
    { label: 'Audit events', value: stats.audit.toLocaleString() },
    { label: 'Outbox events', value: stats.outbox.toLocaleString() },
  ]

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Operational overview for ${state.setup?.organization ?? 'your tenant'}.`}
        actions={
          <>
            <Link href="/documents/upload">
              <Button variant="primary" leftGlyph={<Icon glyph="Upload" />}>
                Upload
              </Button>
            </Link>
            <Link href="/generator">
              <Button leftGlyph={<Icon glyph="Sparkle" />}>Generate dataset</Button>
            </Link>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <Card key={t.label} className="!p-4">
            <Overline className="text-muted">{t.label}</Overline>
            <p className="mt-1 text-2xl font-semibold">{t.value}</p>
          </Card>
        ))}
      </div>

      {stats.documents === 0 && (
        <Card className="mt-6 flex flex-col items-start gap-3">
          <H3>No documents yet</H3>
          <Body className="text-muted">
            Upload your own files or generate a deterministic fictional dataset to exercise search, versioning and auditing.
          </Body>
        </Card>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <H3 className="mb-4">Documents by department</H3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byDept}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8edeb" />
                <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <Tooltip />
                <Bar dataKey="documents" fill="#00684a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <H3>Recent activity</H3>
            <Link href="/activity" className="text-xs font-medium text-mdb-green hover:underline">
              View all
            </Link>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {stats.activity.map((e) => (
              <li key={e.eventId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-mono text-xs">{e.action}</span>
                <span className="text-xs text-muted">{formatDateTime(e.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <H3 className="mb-3">Recently updated</H3>
        {stats.recent.length === 0 ? (
          <Body className="text-muted">Nothing here yet.</Body>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {stats.recent.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <Link href={`/documents/${d._id}`} className="text-sm font-medium hover:underline">
                  {d.title}
                </Link>
                <span className="flex items-center gap-3 text-xs text-muted">
                  {d.department}
                  <ClassificationBadge value={d.classification} />
                  {formatDateTime(d.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="mt-4">
        <EngineNote>Counts computed from collections stored in MongoDB Atlas.</EngineNote>
      </div>
    </>
  )
}
