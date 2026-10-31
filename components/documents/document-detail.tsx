'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import Banner from '@leafygreen-ui/banner'
import Badge from '@leafygreen-ui/badge'
import Icon from '@leafygreen-ui/icon'
import { Tab, Tabs } from '@leafygreen-ui/tabs'
import { Body, H3 } from '@leafygreen-ui/typography'
import { useToast } from '@/components/shared/toast'
import { PageHeader } from '@/components/shell/page-header'
import { ClassificationBadge, EngineNote, StatusBadge } from '@/components/shared/badges'
import { MetadataFields, parseTags, type MetadataDraft } from './metadata-fields'
import { useDemoState } from '@/lib/demo/store'
import { canRead, readVersionBinary, restoreDocument, softDelete, updateMetadata, uploadNewVersion } from '@/lib/demo/services'
import { downloadBlob, formatBytes, formatDateTime } from '@/lib/demo/util'
import type { DmsDocument } from '@/lib/domain/types'

type Preview = { kind: 'text'; text: string } | { kind: 'pdf' | 'image'; url: string } | { kind: 'none'; reason: string }

function toDraft(d: DmsDocument): MetadataDraft {
  return {
    title: d.title,
    description: d.description,
    department: d.department,
    documentType: d.documentType,
    classification: d.classification,
    tags: d.tags.join(', '),
  }
}

export function DocumentDetail({ id }: { id: string }) {
  const state = useDemoState()
  const { pushToast } = useToast()
  const user = state.users[0]
  const doc = state.documents.find((d) => d._id === id)
  const versions = useMemo(
    () => state.documentVersions.filter((v) => v.documentId === id).sort((a, b) => b.versionNumber - a.versionNumber),
    [state.documentVersions, id],
  )
  const history = useMemo(() => state.auditEvents.filter((e) => e.resourceId === id).reverse(), [state.auditEvents, id])
  const chunkCount = useMemo(() => state.documentChunks.filter((c) => c.documentId === id).length, [state.documentChunks, id])

  const [tab, setTab] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<MetadataDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewVersion, setPreviewVersion] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (preview && (preview.kind === 'pdf' || preview.kind === 'image')) URL.revokeObjectURL(preview.url)
    }
  }, [preview])

  if (!doc || !user) {
    return (
      <Banner variant="warning">
        Document not found. <Link href="/documents">Back to library</Link>
      </Banner>
    )
  }
  if (!canRead(user, doc)) {
    return <Banner variant="danger">You do not have access to this document.</Banner>
  }

  const current = versions.find((v) => v._id === doc.currentVersionId) ?? versions[0]

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      pushToast({ variant: 'success', title: success })
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveMetadata = async () => {
    if (!draft) return
    const ok = await run(
      () => updateMetadata(doc._id, { ...draft, title: draft.title.trim(), description: draft.description.trim(), tags: parseTags(draft.tags), folderId: doc.folderId }, doc.concurrencyVersion),
      'Metadata updated',
    )
    if (ok) setEditing(false)
  }

  const download = (versionId: string) =>
    run(async () => {
      const { blob, version } = await readVersionBinary(doc._id, versionId, 'download')
      downloadBlob(blob, version.fileName)
    }, 'Download verified and started')

  const loadPreview = async (versionId: string) => {
    setPreviewVersion(versionId)
    setError(null)
    try {
      const { blob, version } = await readVersionBinary(doc._id, versionId, 'preview')
      if (version.mimeType.startsWith('text/')) setPreview({ kind: 'text', text: await blob.text() })
      else if (version.mimeType === 'application/pdf') setPreview({ kind: 'pdf', url: URL.createObjectURL(blob) })
      else if (version.mimeType.startsWith('image/')) setPreview({ kind: 'image', url: URL.createObjectURL(blob) })
      else setPreview({ kind: 'none', reason: `No in-browser previewer for ${version.mimeType}. Use download instead.` })
    } catch (e) {
      setPreview({ kind: 'none', reason: (e as Error).message })
    }
  }

  return (
    <>
      <div className="mb-2">
        <Link href="/documents" className="inline-flex items-center gap-1 text-xs font-medium text-mdb-green hover:underline">
          <Icon glyph="ArrowLeft" size="small" /> Document Library
        </Link>
      </div>
      <PageHeader
        title={doc.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={doc.status} deleted={!!doc.deletedAt} />
            <ClassificationBadge value={doc.classification} />
            <span>
              {doc.department} - {doc.documentType}
            </span>
            {doc.datasetId && <Badge variant="lightgray">Generated</Badge>}
          </span>
        }
        actions={
          doc.deletedAt ? (
            <Button variant="primary" disabled={busy} onClick={() => run(() => restoreDocument(doc._id), 'Document restored')}>
              Restore
            </Button>
          ) : (
            <>
              {current && (
                <Button leftGlyph={<Icon glyph="Download" />} disabled={busy} onClick={() => download(current._id)}>
                  Download
                </Button>
              )}
              <Button leftGlyph={<Icon glyph="Upload" />} disabled={busy} onClick={() => fileRef.current?.click()}>
                New version
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => run(() => softDelete(doc._id), 'Document moved to deleted')}>
                Delete
              </Button>
            </>
          )
        }
      />
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        aria-label="Upload new version"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void run(() => uploadNewVersion(doc._id, f, doc.concurrencyVersion), `Version uploaded`)
        }}
      />
      {error && (
        <div className="mb-4">
          <Banner variant="danger">{error}</Banner>
        </div>
      )}

      <Tabs aria-label="Document sections" value={tab} onValueChange={(v) => setTab(Number(v))}>
        <Tab name="Overview">
          <div className="grid gap-6 pt-4 xl:grid-cols-3">
            <Card className="flex flex-col gap-4 xl:col-span-2">
              <div className="flex items-center justify-between">
                <H3>Metadata</H3>
                {!doc.deletedAt &&
                  (editing ? (
                    <div className="flex gap-2">
                      <Button size="small" onClick={() => setEditing(false)} disabled={busy}>
                        Cancel
                      </Button>
                      <Button size="small" variant="primary" onClick={saveMetadata} disabled={busy}>
                        Save
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="small"
                      leftGlyph={<Icon glyph="Edit" />}
                      onClick={() => {
                        setDraft(toDraft(doc))
                        setEditing(true)
                      }}
                    >
                      Edit
                    </Button>
                  ))}
              </div>
              {editing && draft ? (
                <MetadataFields value={draft} onChange={setDraft} disabled={busy} />
              ) : (
                <>
                  <Body>{doc.description || <span className="text-muted">No description</span>}</Body>
                  <div className="flex flex-wrap gap-1.5">
                    {doc.tags.map((t) => (
                      <Badge key={t} variant="lightgray">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  {Object.keys(doc.metadata).length > 0 && (
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 border-t border-border pt-4 text-sm">
                      {Object.entries(doc.metadata).map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="text-muted">{k}</dt>
                          <dd>{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </>
              )}
            </Card>
            <Card className="flex flex-col gap-3">
              <H3>Properties</H3>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted">Document id</dt>
                <dd className="truncate font-mono text-xs">{doc._id}</dd>
                <dt className="text-muted">Versions</dt>
                <dd>{versions.length}</dd>
                <dt className="text-muted">Indexed chunks</dt>
                <dd>{chunkCount}</dd>
                <dt className="text-muted">Access</dt>
                <dd>
                  {doc.accessPolicy.departments === 'all' ? 'All departments' : doc.accessPolicy.departments.join(', ')} (min{' '}
                  {doc.accessPolicy.minRole})
                </dd>
                <dt className="text-muted">Concurrency</dt>
                <dd>v{doc.concurrencyVersion}</dd>
                <dt className="text-muted">Created</dt>
                <dd>{formatDateTime(doc.createdAt)}</dd>
                <dt className="text-muted">Updated</dt>
                <dd>{formatDateTime(doc.updatedAt)}</dd>
              </dl>
            </Card>
          </div>
        </Tab>

        <Tab name={`Versions (${versions.length})`}>
          <Card className="mt-4 !p-0">
            <ul className="divide-y divide-border">
              {versions.map((v) => (
                <li key={v._id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Badge variant={v._id === doc.currentVersionId ? 'green' : 'lightgray'}>v{v.versionNumber}</Badge>
                      <span className="text-sm font-medium">{v.fileName}</span>
                      <span className="text-xs text-muted">
                        {formatBytes(v.fileSize)} - {formatDateTime(v.createdAt)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="small"
                        onClick={() => {
                          setTab(2)
                          void loadPreview(v._id)
                        }}
                      >
                        Preview
                      </Button>
                      <Button size="small" onClick={() => download(v._id)} disabled={busy}>
                        Download
                      </Button>
                    </div>
                  </div>
                  <p className="break-all font-mono text-[11px] text-muted">sha256:{v.checksum}</p>
                  <ol className="flex flex-wrap gap-1.5" aria-label="Processing pipeline">
                    {v.pipeline.map((s) => (
                      <li key={s.step} title={s.note}>
                        <Badge variant={s.status === 'succeeded' ? 'green' : s.status === 'failed' ? 'red' : 'lightgray'}>
                          {s.step.replace('_', ' ')}
                        </Badge>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </Card>
        </Tab>

        <Tab name="Preview">
          <Card className="mt-4 flex flex-col gap-3">
            {!preview ? (
              <div className="flex flex-col items-start gap-3">
                <Body className="text-muted">Previews are read from object storage and checksum-verified. Every preview is audited.</Body>
                {current && (
                  <Button variant="primary" onClick={() => loadPreview(current._id)}>
                    Preview current version
                  </Button>
                )}
              </div>
            ) : (
              <>
                <span className="text-xs text-muted">
                  Version {versions.find((v) => v._id === previewVersion)?.versionNumber} - integrity verified
                </span>
                {preview.kind === 'text' && (
                  <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-md bg-background p-4 font-mono text-xs leading-relaxed">
                    {preview.text}
                  </pre>
                )}
                {preview.kind === 'pdf' && <iframe src={preview.url} title="PDF preview" className="h-[640px] w-full rounded-md border border-border" />}
                {preview.kind === 'image' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.url} alt={`Preview of ${doc.title}`} className="max-h-[640px] w-auto self-start rounded-md border border-border" />
                )}
                {preview.kind === 'none' && <Banner variant="warning">{preview.reason}</Banner>}
              </>
            )}
          </Card>
        </Tab>

        <Tab name={`History (${history.length})`}>
          <Card className="mt-4 !p-0">
            <ul className="divide-y divide-border">
              {history.map((e) => (
                <li key={e.eventId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs">{e.action}</span>
                    <Badge variant={e.result === 'success' ? 'green' : 'red'}>{e.result}</Badge>
                  </span>
                  <span className="text-xs text-muted">
                    {e.actorType} - {formatDateTime(e.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </Tab>
      </Tabs>
      <div className="mt-3">
        <EngineNote>Optimistic concurrency enforced on every mutation. Engine: MongoDB Atlas transactions.</EngineNote>
      </div>
    </>
  )
}
