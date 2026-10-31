'use client'

import { CLASSIFICATIONS, DOCUMENT_TYPES, type Department, type DocumentType, type GenerationRun } from '@/lib/domain/types'
import { buildPdf, paginate } from './pdf'
import { createDocument, currentActor } from './services'
import { commit, getDemoState } from './store'
import { mulberry32, newId, nowIso, pick } from './util'

const COMPANIES = ['Northwind Logistics', 'Contoso Health', 'Fabrikam Robotics', 'Tailspin Aviation', 'Woodgrove Capital', 'Litware Systems', 'Adatum Energy', 'Proseware Media']
const PEOPLE = ['Avery Chen', 'Jordan Patel', 'Morgan Silva', 'Riley Okafor', 'Casey Novak', 'Quinn Ramirez', 'Taylor Brooks', 'Sam Lindqvist']
const TOPICS: Record<Department, string[]> = {
  HR: ['remote work eligibility', 'parental leave', 'performance review cadence', 'employee onboarding', 'workplace conduct'],
  Legal: ['data processing addendum', 'intellectual property assignment', 'limitation of liability', 'non-disclosure obligations', 'dispute resolution'],
  Finance: ['quarterly revenue recognition', 'expense reimbursement', 'accounts payable aging', 'capital expenditure approval', 'budget variance'],
  Procurement: ['supplier qualification', 'purchase order thresholds', 'competitive bidding', 'vendor risk assessment', 'contract renewal'],
  IT: ['identity and access management', 'backup and disaster recovery', 'endpoint encryption', 'incident response', 'cloud cost optimization'],
  Operations: ['warehouse throughput', 'service level objectives', 'fleet maintenance', 'capacity planning', 'quality inspection'],
  Compliance: ['records retention schedule', 'anti-bribery controls', 'GDPR subject access requests', 'SOC 2 evidence collection', 'whistleblower reporting'],
  Sales: ['enterprise pricing tiers', 'territory planning', 'renewal forecasting', 'partner referral program', 'discount approval matrix'],
}

function paragraph(rand: () => number, dept: Department, company: string) {
  const topic = pick(rand, TOPICS[dept])
  const person = pick(rand, PEOPLE)
  const amount = Math.round(rand() * 900 + 100) * 100
  const days = Math.round(rand() * 80 + 10)
  const templates = [
    `This section governs ${topic} for ${company}. ${person} is accountable for maintaining the controls described herein and must review them at least every ${days} days.`,
    `Any commitment related to ${topic} exceeding USD ${amount.toLocaleString('en-US')} requires written approval from the ${dept} department lead prior to execution.`,
    `Exceptions concerning ${topic} must be documented, include a business justification, and be retained in accordance with the corporate records retention schedule.`,
    `${person} confirmed that the ${topic} process was tested during the period, with ${Math.round(rand() * 20)} findings logged and remediation due within ${days} days.`,
    `The parties agree that obligations relating to ${topic} survive termination for a period of ${Math.round(rand() * 5 + 1)} years.`,
  ]
  return pick(rand, templates)
}

function buildContent(rand: () => number, dept: Department, type: DocumentType, index: number, revision: number) {
  const company = pick(rand, COMPANIES)
  const owner = pick(rand, PEOPLE)
  const ref = `${dept.slice(0, 3).toUpperCase()}-${type.slice(0, 3).toUpperCase()}-${String(10000 + index)}`
  const title = `${type}: ${company} ${pick(rand, TOPICS[dept]).replace(/\b\w/g, (c) => c.toUpperCase())}`
  const sections = ['Purpose', 'Scope', 'Definitions', 'Responsibilities', 'Terms', 'Controls', 'Review']
  const body: string[] = [
    `Reference: ${ref}  |  Revision: ${revision}  |  Owner: ${owner}  |  Department: ${dept}`,
    'FICTIONAL DOCUMENT GENERATED FOR DEMONSTRATION PURPOSES. NOT A REAL AGREEMENT OR RECORD.',
    '',
  ]
  const count = 3 + Math.floor(rand() * 4)
  for (let s = 0; s < count; s++) {
    body.push(`${s + 1}. ${sections[s % sections.length]}:`)
    const paras = 2 + Math.floor(rand() * 3)
    for (let p = 0; p < paras; p++) body.push(paragraph(rand, dept, company))
    body.push('')
  }
  if (revision > 1) body.push(`Revision ${revision} notes: clarified thresholds and updated accountable owner.`)
  return { title, text: body.join('\n'), ref, company, owner }
}

export interface GeneratorOptions {
  target: number
  seed: number
  departments: Department[]
  formats: ('txt' | 'pdf')[]
  maxVersions: number
}

export async function createGenerationRun(opts: GeneratorOptions): Promise<GenerationRun> {
  const actor = currentActor()
  const run: GenerationRun = {
    _id: newId('gen'),
    tenantId: actor.tenantId,
    datasetId: newId('ds'),
    seed: opts.seed,
    target: opts.target,
    completed: 0,
    formats: opts.formats,
    departments: opts.departments,
    maxVersions: opts.maxVersions,
    status: 'paused',
    checkpoint: 0,
    correlationId: actor.correlationId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  await commit((draft) => {
    draft.generationRuns.push(run)
    draft.auditEvents.push({
      eventId: newId('aud'),
      tenantId: actor.tenantId,
      occurredAt: nowIso(),
      actorId: actor.user._id,
      actorType: 'user',
      action: 'generator.run_created',
      resourceType: 'generation_run',
      resourceId: run._id,
      result: 'success',
      correlationId: actor.correlationId,
      requestId: newId('req'),
      details: { target: opts.target, seed: opts.seed, formats: opts.formats },
    })
  })
  return run
}

async function patchRun(runId: string, patch: Partial<GenerationRun>) {
  await commit((draft) => {
    const run = draft.generationRuns.find((r) => r._id === runId)
    if (run) Object.assign(run, patch, { updatedAt: nowIso() })
  })
}

const activeRuns = new Map<string, { stop: 'pause' | 'cancel' | null }>()

export function isRunActive(runId: string) {
  return activeRuns.has(runId)
}

export function requestStop(runId: string, kind: 'pause' | 'cancel') {
  const handle = activeRuns.get(runId)
  if (handle) handle.stop = kind
  else if (kind === 'cancel') void patchRun(runId, { status: 'cancelled' })
}

/**
 * Executes (or resumes) a generation run from its persisted checkpoint. Every document is
 * derived from (seed, index) so resuming after a reload produces identical output.
 * Runs in the browser tab; Atlas Mode would execute this in a durable worker.
 */
export async function executeRun(runId: string, onProgress?: () => void) {
  if (activeRuns.has(runId)) return
  const handle = { stop: null as 'pause' | 'cancel' | null }
  activeRuns.set(runId, handle)
  const actor = currentActor()
  try {
    const run = getDemoState().generationRuns.find((r) => r._id === runId)
    if (!run) throw new Error('Run not found')
    await patchRun(runId, { status: 'running', error: undefined })
    const baseTime = Date.parse(run.createdAt)
    for (let i = run.checkpoint; i < run.target; i++) {
      if (handle.stop) {
        await patchRun(runId, { status: handle.stop === 'pause' ? 'paused' : 'cancelled' })
        return
      }
      const rand = mulberry32(run.seed * 100003 + i)
      const dept = pick(rand, run.departments)
      const type = pick(rand, DOCUMENT_TYPES)
      const format = pick(rand, run.formats)
      const versionCount = 1 + Math.floor(rand() * run.maxVersions)
      const versions = Array.from({ length: versionCount }, (_, v) => {
        const content = buildContent(mulberry32(run.seed * 7919 + i * 31 + v), dept, type, i, v + 1)
        const pages = paginate(content.text)
        const blob = format === 'pdf' ? buildPdf(content.title, pages) : new Blob([pages.join('\f')], { type: 'text/plain' })
        return { content, pages, blob }
      })
      const first = versions[0].content
      const classification = pick(rand, CLASSIFICATIONS)
      const ext = format === 'pdf' ? 'pdf' : 'txt'
      const mimeType = format === 'pdf' ? 'application/pdf' : 'text/plain'
      const fileName = `${first.ref}.${ext}`
      const [initial, ...rest] = versions
      await createDocument(
        {
          blob: initial.blob,
          fileName,
          mimeType,
          pages: initial.pages,
          title: first.title,
          description: `Fictional ${type.toLowerCase()} for ${first.company}, owned by ${first.owner}.`,
          department: dept,
          documentType: type,
          classification,
          tags: [dept.toLowerCase(), type.toLowerCase().replace(/\s+/g, '-'), 'generated'],
          metadata: { reference: first.ref, counterparty: first.company, accountableOwner: first.owner },
          datasetId: run.datasetId,
          generationRunId: run._id,
          createdAt: new Date(baseTime - Math.floor(rand() * 30) * 86400000).toISOString(),
          extraVersions: rest.map((v) => ({ blob: v.blob, fileName, mimeType, pages: v.pages })),
        },
        actor,
      )
      await patchRun(runId, { completed: i + 1, checkpoint: i + 1 })
      onProgress?.()
      if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0))
    }
    await patchRun(runId, { status: 'completed' })
  } catch (error) {
    await patchRun(runId, { status: 'failed', error: (error as Error).message })
  } finally {
    activeRuns.delete(runId)
  }
}
