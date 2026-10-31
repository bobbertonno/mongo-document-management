'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import TextInput from '@leafygreen-ui/text-input'
import Banner from '@leafygreen-ui/banner'
import Badge from '@leafygreen-ui/badge'
import Icon from '@leafygreen-ui/icon'
import { Body, H2, H3, Overline } from '@leafygreen-ui/typography'
import { useToast } from '@/components/shared/toast'
import { setupEnvironmentSchema } from '@/lib/domain/types'
import { completeSetup } from '@/lib/demo/services'
import { fetchAtlasStatus, useDemoState } from '@/lib/demo/store'
import { fetchVectorStatus, initVectorSearch } from '@/lib/demo/vector'
import useSWR from 'swr'
import { VectorSearchPanel } from './vector-search-panel'

const STEPS = ['Atlas connection', 'Organization', 'Capabilities', 'Review'] as const

const CAPABILITIES = [
  { name: 'Metadata store', engine: 'MongoDB Atlas collections', available: true },
  { name: 'Binary storage', engine: 'MongoDB GridFS bucket', available: true },
  { name: 'Full-text search', engine: 'BM25 over chunks stored in Atlas', available: true },
  { name: 'Transactions', engine: 'Multi-collection MongoDB transactions', available: true },
  { name: 'Event streaming', engine: 'Transactional outbox in Atlas', available: true },
  { name: 'Malware scanning', engine: 'Not configured (step recorded as skipped)', available: false },
]

export function SetupWizard() {
  const state = useDemoState()
  const router = useRouter()
  const { pushToast } = useToast()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ organization: '', adminName: '', adminEmail: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const {
    data: atlas,
    isLoading: atlasLoading,
    isValidating: atlasValidating,
    mutate: recheckAtlas,
  } = useSWR('atlas-status', fetchAtlasStatus, { revalidateOnFocus: false })
  const atlasReady = !!atlas?.connected
  const {
    data: vector,
    error: vectorError,
    isLoading: vectorLoading,
    mutate: mutateVector,
  } = useSWR(atlasReady && step >= 2 ? 'vector-status' : null, fetchVectorStatus, {
    revalidateOnFocus: false,
    refreshInterval: (latest) => (latest?.index && !latest.index.queryable ? 4000 : 0),
  })
  const [initializingVector, setInitializingVector] = useState(false)
  const vectorReady = !!vector?.voyageConfigured && !!vector.index
  const embeddingMode = vectorReady ? 'voyage' : 'disabled'

  const initializeVector = async () => {
    setInitializingVector(true)
    try {
      await mutateVector(await initVectorSearch(), { revalidate: false })
      pushToast({ variant: 'success', title: 'Vector search initialized', description: 'Atlas Vector Search index created.' })
    } catch (error) {
      pushToast({ variant: 'warning', title: 'Vector search failed', description: (error as Error).message })
    } finally {
      setInitializingVector(false)
    }
  }
  const atlasText = atlasLoading
    ? 'Checking MongoDB Atlas connection...'
    : atlasReady
      ? `Connected to database "${atlas.database}" (${atlas.latencyMs} ms). Metadata is stored in Atlas collections and files in GridFS.`
      : atlas?.configured
        ? (atlas.error ?? 'MONGODB_URI is set but the cluster is unreachable.')
        : 'MONGODB_URI is not configured in this deployment. Add it in the project environment variables.'

  if (state.setup?.completed) {
    return (
      <div className="mx-auto max-w-2xl">
        <Banner variant="success">
          Setup was completed on {new Date(state.setup.completedAt!).toLocaleString()} for {state.setup.organization}. To start over,
          use Reset all data in System Settings.
        </Banner>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={() => router.push('/')}>
            Go to dashboard
          </Button>
          <Button onClick={() => router.push('/admin/settings')}>System settings</Button>
        </div>
      </div>
    )
  }

  const validateOrg = () => {
    const parsed = setupEnvironmentSchema.safeParse(form)
    if (parsed.success) {
      setErrors({})
      return true
    }
    setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
    return false
  }

  const next = () => {
    if (step === 0 && !atlasReady) return
    if (step === 1 && !validateOrg()) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const finish = async () => {
    if (!atlasReady) return setStep(0)
    if (!validateOrg()) return setStep(1)
    setSubmitting(true)
    try {
      await completeSetup({ ...form, embeddingMode })
      pushToast({ variant: 'success', title: 'Environment ready', description: 'Tenant created in MongoDB Atlas.' })
      router.replace('/')
    } catch (error) {
      pushToast({ variant: 'warning', title: 'Setup failed', description: (error as Error).message })
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2">
        <span className="h-7 w-1.5 rounded-sm bg-spring" aria-hidden="true" />
        <Overline>Atlas Document Hub</Overline>
      </div>
      <H2 as="h1">Set up your environment</H2>

      <ol className="flex flex-wrap gap-2" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
              i === step ? 'border-mdb-green bg-[#e3fcf7] text-[#00684a]' : i < step ? 'border-border text-mdb-green' : 'border-border text-muted'
            }`}
          >
            {i < step ? <Icon glyph="Checkmark" size="small" /> : <span>{i + 1}</span>}
            {label}
          </li>
        ))}
      </ol>

      <Card className="flex flex-col gap-5">
        {step === 0 && (
          <>
            <H3>MongoDB Atlas connection</H3>
            <div
              className={`flex items-start gap-3 rounded-lg border-2 p-4 ${atlasReady ? 'border-mdb-green' : 'border-border'}`}
              role="status"
              aria-live="polite"
            >
              <Icon glyph={atlasReady ? 'CheckmarkWithCircle' : 'Warning'} className={atlasReady ? 'text-mdb-green' : 'text-muted'} />
              <span className="flex flex-col gap-1">
                <strong className="text-sm">{atlasReady ? 'Connected' : atlasLoading ? 'Checking' : 'Not connected'}</strong>
                <span className="text-xs text-muted">{atlasText}</span>
              </span>
            </div>
            {!atlasReady && !atlasLoading && (
              <div className="flex items-center gap-3">
                <Button size="small" onClick={() => void recheckAtlas()} disabled={atlasValidating}>
                  {atlasValidating ? 'Checking...' : 'Check again'}
                </Button>
                <Body className="text-xs text-muted">All data, files, audit and outbox records are stored in MongoDB Atlas.</Body>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <H3>Organization and bootstrap administrator</H3>
            <TextInput
              label="Organization name"
              value={form.organization}
              onChange={(e) => setForm({ ...form, organization: e.target.value })}
              state={errors.organization ? 'error' : 'none'}
              errorMessage={errors.organization}
            />
            <TextInput
              label="Administrator name"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              state={errors.adminName ? 'error' : 'none'}
              errorMessage={errors.adminName}
            />
            <TextInput
              label="Administrator email"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              state={errors.adminEmail ? 'error' : 'none'}
              errorMessage={errors.adminEmail}
            />
            <Body className="text-muted">
              The administrator is granted the TenantAdmin role for a newly generated tenant id. Departmental folders are provisioned automatically.
            </Body>
          </>
        )}

        {step === 2 && (
          <>
            <H3>Capability configuration</H3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="py-2 pr-4 font-medium">Capability</th>
                    <th className="py-2 pr-4 font-medium">Engine</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {CAPABILITIES.map((c) => (
                    <tr key={c.name} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-medium">{c.name}</td>
                      <td className="py-2 pr-4 text-muted">{c.engine}</td>
                      <td className="py-2">
                        <Badge variant={c.available ? 'green' : 'lightgray'}>{c.available ? 'Enabled' : 'Not configured'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <VectorSearchPanel
              status={vector}
              loading={vectorLoading}
              error={vectorError as Error | undefined}
              initializing={initializingVector}
              onInitialize={() => void initializeVector()}
            />
          </>
        )}

        {step === 3 && (
          <>
            <H3>Review</H3>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted">Mode</dt>
              <dd>MongoDB Atlas{atlas?.database ? ` (database "${atlas.database}")` : ''}</dd>
              <dt className="text-muted">Organization</dt>
              <dd>{form.organization}</dd>
              <dt className="text-muted">Administrator</dt>
              <dd>
                {form.adminName} ({form.adminEmail})
              </dd>
              <dt className="text-muted">Storage</dt>
              <dd>mongodb-gridfs</dd>
              <dt className="text-muted">Embeddings</dt>
              <dd>{vectorReady ? `Voyage AI ${vector.model} (${vector.dimensions} dims) + Atlas Vector Search` : 'disabled'}</dd>
            </dl>
          </>
        )}

        <div className="flex justify-between border-t border-border pt-4">
          <Button disabled={step === 0 || submitting} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={next} disabled={step === 0 && !atlasReady}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={finish} disabled={submitting || !atlasReady}>
              {submitting ? 'Creating tenant...' : 'Complete setup'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
