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
import { useDemoState } from '@/lib/demo/store'

const STEPS = ['Operating mode', 'Organization', 'Capabilities', 'Review'] as const

const CAPABILITIES = [
  { name: 'Metadata store', demo: 'IndexedDB (browser)', atlas: 'MongoDB Atlas cluster', available: true },
  { name: 'Binary storage', demo: 'IndexedDB object store', atlas: 'S3 / Azure Blob / GCS / MinIO', available: true },
  { name: 'Full-text search', demo: 'Local BM25 over real chunks', atlas: 'MongoDB Search ($search)', available: true },
  { name: 'Semantic search', demo: 'Disabled', atlas: 'Voyage AI + Atlas Vector Search', available: false },
  { name: 'Event streaming', demo: 'Transactional outbox log', atlas: 'Kafka / Confluent', available: true },
  { name: 'Malware scanning', demo: 'Not configured (step recorded as skipped)', atlas: 'ClamAV / cloud scanner', available: false },
]

export function SetupWizard() {
  const state = useDemoState()
  const router = useRouter()
  const { pushToast } = useToast()
  const [step, setStep] = useState(0)
  const [mode, setMode] = useState('demo')
  const [form, setForm] = useState({ organization: '', adminName: '', adminEmail: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  if (state.setup?.completed) {
    return (
      <div className="mx-auto max-w-2xl">
        <Banner variant="success">
          Setup was completed on {new Date(state.setup.completedAt!).toLocaleString()} for {state.setup.organization}. To start over,
          use Reset demo data in System Settings.
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
    if (step === 1 && !validateOrg()) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const finish = async () => {
    if (!validateOrg()) return setStep(1)
    setSubmitting(true)
    try {
      await completeSetup(form)
      pushToast({ variant: 'success', title: 'Environment ready', description: 'Demo Mode tenant created.' })
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
            <H3>Choose an operating mode</H3>
            <fieldset className="flex flex-col gap-3 md:flex-row">
              <legend className="sr-only">Operating mode</legend>
              {[
                { value: 'demo', title: 'Demo Mode', text: 'All data and files persist in this browser via IndexedDB. No external services.', disabled: false },
                { value: 'atlas', title: 'Atlas Mode', text: 'Requires MONGODB_URI and an object store. Not configured in this deployment.', disabled: true },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex flex-1 cursor-pointer gap-3 rounded-lg border-2 p-4 ${
                    mode === opt.value ? 'border-mdb-green' : 'border-border'
                  } ${opt.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={opt.value}
                    checked={mode === opt.value}
                    disabled={opt.disabled}
                    onChange={(e) => setMode(e.target.value)}
                    className="mt-1 accent-[#00684a]"
                  />
                  <span className="flex flex-col gap-1">
                    <strong className="text-sm">{opt.title}</strong>
                    <span className="text-xs text-muted">{opt.text}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <Banner variant="info">
              Demo Mode runs every implemented workflow against real persisted records, but it does not use MongoDB. Each screen states
              which engine executed the operation.
            </Banner>
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
                    <th className="py-2 pr-4 font-medium">This environment</th>
                    <th className="py-2 font-medium">Atlas Mode equivalent</th>
                  </tr>
                </thead>
                <tbody>
                  {CAPABILITIES.map((c) => (
                    <tr key={c.name} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-medium">{c.name}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={c.available ? 'green' : 'lightgray'}>{c.demo}</Badge>
                      </td>
                      <td className="py-2 text-muted">{c.atlas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <H3>Review</H3>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted">Mode</dt>
              <dd>Demo (browser-persistent)</dd>
              <dt className="text-muted">Organization</dt>
              <dd>{form.organization}</dd>
              <dt className="text-muted">Administrator</dt>
              <dd>
                {form.adminName} ({form.adminEmail})
              </dd>
              <dt className="text-muted">Storage</dt>
              <dd>browser-indexeddb</dd>
              <dt className="text-muted">Embeddings</dt>
              <dd>disabled</dd>
            </dl>
          </>
        )}

        <div className="flex justify-between border-t border-border pt-4">
          <Button disabled={step === 0 || submitting} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={next}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={finish} disabled={submitting}>
              {submitting ? 'Creating tenant...' : 'Complete setup'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
