'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import Icon from '@leafygreen-ui/icon'
import Checkbox from '@leafygreen-ui/checkbox'
import { SearchInput } from '@leafygreen-ui/search-input'
import { Option, Select } from '@leafygreen-ui/select'
import { Body } from '@leafygreen-ui/typography'
import { PageHeader } from '@/components/shell/page-header'
import { ClassificationBadge, EngineNote, StatusBadge } from '@/components/shared/badges'
import { useDemoState } from '@/lib/demo/store'
import { canRead } from '@/lib/demo/services'
import { formatDateTime } from '@/lib/demo/util'
import { CLASSIFICATIONS, DEPARTMENTS, DOCUMENT_TYPES } from '@/lib/domain/types'

const PAGE_SIZE = 25
const ALL = '__all'

export function DocumentLibrary() {
  const state = useDemoState()
  const [q, setQ] = useState('')
  const [department, setDepartment] = useState(ALL)
  const [docType, setDocType] = useState(ALL)
  const [classification, setClassification] = useState(ALL)
  const [showDeleted, setShowDeleted] = useState(false)
  const [sort, setSort] = useState<'updated' | 'title'>('updated')
  const [page, setPage] = useState(0)

  const user = state.users[0]
  const versionCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of state.documentVersions) m.set(v.documentId, (m.get(v.documentId) ?? 0) + 1)
    return m
  }, [state.documentVersions])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = state.documents.filter(
      (d) =>
        user &&
        canRead(user, d) &&
        (showDeleted ? !!d.deletedAt : !d.deletedAt) &&
        (department === ALL || d.department === department) &&
        (docType === ALL || d.documentType === docType) &&
        (classification === ALL || d.classification === classification) &&
        (!needle || d.title.toLowerCase().includes(needle) || d.tags.some((t) => t.includes(needle))),
    )
    return filtered.sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)))
  }, [state.documents, user, q, department, docType, classification, showDeleted, sort])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v)
    setPage(0)
  }

  return (
    <>
      <PageHeader
        title="Document Library"
        description="Browse, filter and manage documents you are authorized to read."
        actions={
          <Link href="/documents/upload">
            <Button variant="primary" leftGlyph={<Icon glyph="Upload" />}>
              Upload document
            </Button>
          </Link>
        }
      />
      <Card className="!p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6 xl:items-end">
          <div className="xl:col-span-2">
            <SearchInput aria-label="Filter by title or tag" placeholder="Filter by title or tag" value={q} onChange={(e) => resetPage(setQ)(e.target.value)} />
          </div>
          <Select label="Department" size="small" value={department} onChange={resetPage(setDepartment)}>
            <Option value={ALL}>All departments</Option>
            {DEPARTMENTS.map((d) => (
              <Option key={d} value={d}>
                {d}
              </Option>
            ))}
          </Select>
          <Select label="Type" size="small" value={docType} onChange={resetPage(setDocType)}>
            <Option value={ALL}>All types</Option>
            {DOCUMENT_TYPES.map((d) => (
              <Option key={d} value={d}>
                {d}
              </Option>
            ))}
          </Select>
          <Select label="Classification" size="small" value={classification} onChange={resetPage(setClassification)}>
            <Option value={ALL}>All</Option>
            {CLASSIFICATIONS.map((d) => (
              <Option key={d} value={d}>
                {d}
              </Option>
            ))}
          </Select>
          <Select label="Sort" size="small" value={sort} onChange={(v) => setSort(v as 'updated' | 'title')}>
            <Option value="updated">Last updated</Option>
            <Option value="title">Title</Option>
          </Select>
        </div>
        <div className="mt-3">
          <Checkbox label="Show deleted documents only" checked={showDeleted} onChange={(e) => resetPage(setShowDeleted)(e.target.checked)} />
        </div>
      </Card>

      <Card className="mt-4 !p-0">
        {visible.length === 0 ? (
          <div className="p-8 text-center">
            <Body className="text-muted">No documents match the current filters.</Body>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Classification</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Versions</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d._id} className="border-b border-border last:border-0 hover:bg-background">
                    <td className="max-w-md px-4 py-3">
                      <Link href={`/documents/${d._id}`} className="font-medium text-foreground hover:underline">
                        {d.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{d.department}</td>
                    <td className="px-4 py-3">{d.documentType}</td>
                    <td className="px-4 py-3">
                      <ClassificationBadge value={d.classification} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={d.status} deleted={!!d.deletedAt} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">{versionCount.get(d._id) ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(d.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <span className="text-muted">
            {rows.length.toLocaleString()} document{rows.length === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <Button size="small" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Previous
            </Button>
            <span className="tabular-nums text-muted">
              {current + 1} / {pageCount}
            </span>
            <Button size="small" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>
      <div className="mt-3">
        <EngineNote>Authorization filter applied before pagination. Demo engine: in-memory query over IndexedDB records.</EngineNote>
      </div>
    </>
  )
}
