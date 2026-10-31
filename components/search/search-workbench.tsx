'use client'

import Link from 'next/link'
import { useState } from 'react'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import Banner from '@leafygreen-ui/banner'
import { SearchInput } from '@leafygreen-ui/search-input'
import { Option, Select } from '@leafygreen-ui/select'
import { Body, H3, Overline } from '@leafygreen-ui/typography'
import { PageHeader } from '@/components/shell/page-header'
import { ClassificationBadge, EngineNote } from '@/components/shared/badges'
import { runSearch, type SearchFilters, type SearchMode, type SearchResponse } from '@/lib/demo/search'
import { CLASSIFICATIONS, DEPARTMENTS, DOCUMENT_TYPES, type Classification, type Department, type DocumentType } from '@/lib/domain/types'
import { cn } from '@/lib/utils'

const MODES: { value: SearchMode; label: string; hint: string }[] = [
  { value: 'metadata', label: 'Metadata', hint: 'Title, tags and fields' },
  { value: 'fulltext', label: 'Full text', hint: 'Indexed chunk content' },
  { value: 'semantic', label: 'Semantic', hint: 'Requires embeddings' },
  { value: 'hybrid', label: 'Hybrid', hint: 'Lexical + vector fusion' },
]
const ALL = '__all'

export function SearchWorkbench() {
  const [mode, setMode] = useState<SearchMode>('fulltext')
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState(ALL)
  const [docType, setDocType] = useState(ALL)
  const [classification, setClassification] = useState(ALL)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPipeline, setShowPipeline] = useState(false)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!query.trim()) return
    const filters: SearchFilters = {
      department: department === ALL ? undefined : (department as Department),
      documentType: docType === ALL ? undefined : (docType as DocumentType),
      classification: classification === ALL ? undefined : (classification as Classification),
    }
    setLoading(true)
    setError(null)
    try {
      setResult(await runSearch(mode, query, filters))
    } catch (err) {
      setResult(null)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader title="Intelligent Search" description="Authorization-aware search over document metadata and extracted content." />
      <Card className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Search mode</legend>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={cn(
                  'flex cursor-pointer flex-col rounded-md border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mdb-green',
                  mode === m.value ? 'border-mdb-green bg-[#e3fcf7]' : 'border-border',
                )}
              >
                <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="sr-only" />
                <span className="font-medium">{m.label}</span>
                <span className="text-xs text-muted">{m.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <SearchInput aria-label="Search query" placeholder="e.g. termination clause, invoice approval" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button type="submit" variant="primary" disabled={loading || !query.trim()}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </form>
        <div className="grid gap-3 md:grid-cols-3">
          <Select label="Department" size="small" value={department} onChange={setDepartment}>
            <Option value={ALL}>All departments</Option>
            {DEPARTMENTS.map((d) => (
              <Option key={d} value={d}>
                {d}
              </Option>
            ))}
          </Select>
          <Select label="Type" size="small" value={docType} onChange={setDocType}>
            <Option value={ALL}>All types</Option>
            {DOCUMENT_TYPES.map((d) => (
              <Option key={d} value={d}>
                {d}
              </Option>
            ))}
          </Select>
          <Select label="Classification" size="small" value={classification} onChange={setClassification}>
            <Option value={ALL}>All</Option>
            {CLASSIFICATIONS.map((d) => (
              <Option key={d} value={d}>
                {d}
              </Option>
            ))}
          </Select>
        </div>
      </Card>

      {error && (
        <div className="mt-4">
          <Banner variant="warning">{error}</Banner>
        </div>
      )}

      {result && (
        <div className="mt-6 grid gap-6 xl:grid-cols-4">
          <div className="flex flex-col gap-3 xl:col-span-3">
            <p className="text-sm text-muted">
              {result.totalMatches} result{result.totalMatches === 1 ? '' : 's'} in {result.latencyMs} ms
            </p>
            {result.hits.length === 0 && (
              <Card>
                <Body className="text-muted">No authorized documents matched this query.</Body>
              </Card>
            )}
            {result.hits.map((hit) => (
              <Card key={hit.document._id} className="flex flex-col gap-2 !p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/documents/${hit.document._id}`} className="font-medium hover:underline">
                    {hit.document.title}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {hit.document.department}
                    <ClassificationBadge value={hit.document.classification} />
                    <span className="font-mono">score {hit.score.toFixed(3)}</span>
                  </span>
                </div>
                {hit.matchingChunks.slice(0, 2).map((c) => (
                  <p key={c.chunkId} className="text-sm leading-relaxed text-muted">
                    <span className="mr-2 font-mono text-[11px]">p.{c.pageNumber}</span>
                    {c.snippet.map((s, i) =>
                      s.highlight ? (
                        <mark key={i} className="rounded bg-[#fef7db] px-0.5 text-foreground">
                          {s.text}
                        </mark>
                      ) : (
                        <span key={i}>{s.text}</span>
                      ),
                    )}
                  </p>
                ))}
              </Card>
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <Card className="flex flex-col gap-2 !p-4">
              <H3>Query stats</H3>
              <dl className="grid grid-cols-[1fr_max-content] gap-y-1 text-sm">
                <dt className="text-muted">Engine</dt>
                <dd>{result.engine}</dd>
                <dt className="text-muted">Chunks scanned</dt>
                <dd className="tabular-nums">{result.chunksScanned}</dd>
                <dt className="text-muted">Chunks matched</dt>
                <dd className="tabular-nums">{result.chunksMatched}</dd>
                <dt className="text-muted">Denied by ACL</dt>
                <dd className="tabular-nums">{result.deniedByAcl}</dd>
              </dl>
            </Card>
            <Card className="flex flex-col gap-3 !p-4">
              <H3>Facets</H3>
              {(['department', 'documentType', 'classification'] as const).map((k) => (
                <div key={k}>
                  <Overline className="text-muted">{k}</Overline>
                  <ul className="mt-1 text-sm">
                    {Object.entries(result.facets[k]).map(([name, count]) => (
                      <li key={name} className="flex justify-between">
                        <span>{name}</span>
                        <span className="tabular-nums text-muted">{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
            <Card className="flex flex-col gap-2 !p-4">
              <div className="flex items-center justify-between">
                <H3>Atlas equivalent</H3>
                <Button size="xsmall" onClick={() => setShowPipeline((v) => !v)}>
                  {showPipeline ? 'Hide' : 'Show'}
                </Button>
              </div>
              {showPipeline && (
                <pre className="max-h-80 overflow-auto rounded-md bg-[#001e2b] p-3 font-mono text-[11px] leading-relaxed text-[#e3fcf7]">
                  {JSON.stringify(result.equivalentAtlasPipeline, null, 2)}
                </pre>
              )}
            </Card>
          </div>
        </div>
      )}
      <div className="mt-4">
        <EngineNote>Demo engine: local lexical index. ACL filtering runs before ranking and limiting. Every search is audited.</EngineNote>
      </div>
    </>
  )
}
