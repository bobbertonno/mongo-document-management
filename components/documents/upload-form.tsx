'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import Banner from '@leafygreen-ui/banner'
import Icon from '@leafygreen-ui/icon'
import { Body, H3 } from '@leafygreen-ui/typography'
import { useToast } from '@/components/shared/toast'
import { PageHeader } from '@/components/shell/page-header'
import { EngineNote } from '@/components/shared/badges'
import { MetadataFields, parseTags, type MetadataDraft } from './metadata-fields'
import { createDocument, validateFile } from '@/lib/demo/services'
import { formatBytes } from '@/lib/demo/util'
import { ALLOWED_MIME_TYPES } from '@/lib/domain/types'

const ACCEPT = Object.entries(ALLOWED_MIME_TYPES)
  .flatMap(([mime, exts]) => [mime, ...exts.map((e) => `.${e}`)])
  .join(',')

export function UploadForm() {
  const router = useRouter()
  const { pushToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [draft, setDraft] = useState<MetadataDraft>({
    title: '',
    description: '',
    department: 'Operations',
    documentType: 'Report',
    classification: 'Internal',
    tags: '',
  })

  const pick = (f: File | undefined) => {
    if (!f) return
    try {
      validateFile(f)
      setFileError(null)
      setFile(f)
      if (!draft.title) setDraft((d) => ({ ...d, title: f.name.replace(/\.[^.]+$/, '') }))
    } catch (error) {
      setFile(null)
      setFileError((error as Error).message)
    }
  }

  const submit = async () => {
    if (!file) return setFileError('Choose a file to upload')
    if (!draft.title.trim()) return setTitleError('Title is required')
    setTitleError(undefined)
    setSubmitting(true)
    try {
      const doc = await createDocument({
        blob: file,
        fileName: file.name,
        mimeType: file.type,
        title: draft.title.trim(),
        description: draft.description.trim(),
        department: draft.department,
        documentType: draft.documentType,
        classification: draft.classification,
        tags: parseTags(draft.tags),
      })
      pushToast({ variant: 'success', title: 'Document uploaded', description: draft.title })
      router.push(`/documents/${doc._id}`)
    } catch (error) {
      setFileError((error as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader title="Upload document" description="Files are validated, checksummed and stored before metadata is committed." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="flex flex-col gap-4 xl:col-span-1">
          <H3>File</H3>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              pick(e.dataTransfer.files[0])
            }}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-10 text-center hover:border-mdb-green focus-visible:border-mdb-green focus-visible:outline-none"
          >
            <Icon glyph="Upload" size="xlarge" />
            <Body>{file ? file.name : 'Drop a file or click to browse'}</Body>
            <span className="text-xs text-muted">
              {file ? `${file.type} - ${formatBytes(file.size)}` : 'PDF, DOCX, TXT, CSV, PNG, JPEG up to 10 MB'}
            </span>
          </div>
          <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" aria-label="Choose file" onChange={(e) => pick(e.target.files?.[0])} />
          {fileError && <Banner variant="danger">{fileError}</Banner>}
          <Banner variant="info">
            Text extraction runs in-browser for TXT and CSV. Other formats are stored and versioned but marked not indexed.
          </Banner>
        </Card>
        <Card className="flex flex-col gap-4 xl:col-span-2">
          <H3>Metadata</H3>
          <MetadataFields value={draft} onChange={setDraft} disabled={submitting} titleError={titleError} />
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button onClick={() => router.push('/documents')} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={submitting}>
              {submitting ? 'Processing...' : 'Upload'}
            </Button>
          </div>
        </Card>
      </div>
      <div className="mt-3">
        <EngineNote>Binary stored in the browser IndexedDB object store; metadata, audit and outbox committed together.</EngineNote>
      </div>
    </>
  )
}
