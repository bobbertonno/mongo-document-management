'use client'

import { useState } from 'react'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import Banner from '@leafygreen-ui/banner'
import Badge from '@leafygreen-ui/badge'
import Checkbox from '@leafygreen-ui/checkbox'
import TextInput from '@leafygreen-ui/text-input'
import { Body, H3 } from '@leafygreen-ui/typography'
import { useToast } from '@/components/shared/toast'
import { PageHeader } from '@/components/shell/page-header'
import { EngineNote } from '@/components/shared/badges'
import { createGenerationRun, executeRun, isRunActive, requestStop } from '@/lib/demo/generator'
import { cleanupDataset } from '@/lib/demo/services'
import { useDemoState } from '@/lib/demo/store'
import { formatDateTime } from '@/lib/demo/util'
import { DEPARTMENTS, type Department, type GenerationRun } from '@/lib/domain/types'

const STATUS_VARIANT: Record<GenerationRun['status'], 'green' | 'blue' | 'yellow' | 'red' | 'lightgray'> = {
  running: 'blue',
  paused: 'yellow',
  completed: 'green',
  cancelled: 'lightgray',
  failed: 'red',
}

export function GeneratorConsole() {
  const state = useDemoState()
  const { pushToast } = useToast()
  const [target, setTarget] = useState('50')
  const [seed, setSeed] = useState('42')
  const [maxVersions, setMaxVersions] = useState('3')
  const [departments, setDepartments] = useState<Department[]>([...DEPARTMENTS])
  const [formats, setFormats] = useState<('txt' | 'pdf')[]>(['txt', 'pdf'])
  const [error, setError] = useState<string | null>(null)

  const runs = [...state.generationRuns].reverse()

  const start = async () => {
    const t = Number(target)
    const s = Number(seed)
    const mv = Number(maxVersions)
    if (!Number.isInteger(t) || t < 1 || t > 2000) return setError('Target must be an integer between 1 and 2000')
    if (!Number.isInteger(s) || s < 0) return setError('Seed must be a non-negative integer')
    if (!Number.isInteger(mv) || mv < 1 || mv > 5) return setError('Max versions must be between 1 and 5')
    if (!departments.length) return setError('Select at least one department')
    if (!formats.length) return setError('Select at least one format')
    setError(null)
    try {
      const run = await createGenerationRun({ target: t, seed: s, departments, formats, maxVersions: mv })
      void executeRun(run._id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <>
      <PageHeader title="Document Generator" description="Create deterministic, fictional datasets through the real ingestion pipeline." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="flex flex-col gap-4">
          <H3>New run</H3>
          <div className="grid grid-cols-3 gap-3">
            <TextInput label="Documents" type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
            <TextInput label="Seed" type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
            <TextInput label="Max versions" type="number" value={maxVersions} onChange={(e) => setMaxVersions(e.target.value)} />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Formats</legend>
            <div className="flex gap-4">
              {(['txt', 'pdf'] as const).map((f) => (
                <Checkbox key={f} label={f.toUpperCase()} checked={formats.includes(f)} onChange={() => setFormats(toggle(formats, f))} />
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Departments</legend>
            <div className="grid grid-cols-2 gap-2">
              {DEPARTMENTS.map((d) => (
                <Checkbox key={d} label={d} checked={departments.includes(d)} onChange={() => setDepartments(toggle(departments, d))} />
              ))}
            </div>
          </fieldset>
          {error && <Banner variant="danger">{error}</Banner>}
          <Button variant="primary" onClick={start}>
            Start generation
          </Button>
          <Body className="text-xs text-muted">
            Same seed and options always produce identical content. Runs checkpoint after every document and can resume after a reload.
          </Body>
        </Card>

        <Card className="flex flex-col gap-3 !p-0 xl:col-span-2">
          <div className="px-4 pt-4">
            <H3>Runs</H3>
          </div>
          {runs.length === 0 ? (
            <Body className="px-4 pb-4 text-muted">No runs yet.</Body>
          ) : (
            <ul className="divide-y divide-border">
              {runs.map((r) => {
                const pct = Math.round((r.completed / r.target) * 100)
                const docs = state.documents.filter((d) => d.datasetId === r.datasetId).length
                const resumable = (r.status === 'paused' || r.status === 'failed') && !isRunActive(r._id)
                return (
                  <li key={r._id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm">
                        <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                        <span className="font-mono text-xs">{r.datasetId}</span>
                        <span className="text-xs text-muted">
                          seed {r.seed} - {formatDateTime(r.createdAt)}
                        </span>
                      </span>
                      <span className="flex gap-2">
                        {r.status === 'running' && (
                          <Button size="xsmall" onClick={() => requestStop(r._id, 'pause')}>
                            Pause
                          </Button>
                        )}
                        {resumable && (
                          <Button size="xsmall" onClick={() => void executeRun(r._id)}>
                            Resume
                          </Button>
                        )}
                        {(r.status === 'running' || r.status === 'paused') && (
                          <Button size="xsmall" onClick={() => requestStop(r._id, 'cancel')}>
                            Cancel
                          </Button>
                        )}
                        {r.status !== 'running' && (
                          <Button
                            size="xsmall"
                            variant="danger"
                            onClick={async () => {
                              const n = await cleanupDataset(r.datasetId)
                              pushToast({ variant: 'success', title: 'Dataset removed', description: `${n} generated documents deleted` })
                            }}
                          >
                            Clean up
                          </Button>
                        )}
                      </span>
                    </div>
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full bg-[#e8edeb]"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Run ${r.datasetId} progress`}
                    >
                      <div className="h-full bg-mdb-green transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted">
                      {r.completed} / {r.target} documents ({docs} stored) - {r.formats.join(', ')} - up to {r.maxVersions} versions
                      {r.error && <span className="text-[#db3030]"> - {r.error}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
      <div className="mt-3">
        <EngineNote>Runs execute in this browser tab. Atlas Mode would dispatch them to a durable worker.</EngineNote>
      </div>
    </>
  )
}
