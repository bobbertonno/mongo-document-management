'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@leafygreen-ui/button'
import Card from '@leafygreen-ui/card'
import Banner from '@leafygreen-ui/banner'
import { Body, H3 } from '@leafygreen-ui/typography'
import { PageHeader } from '@/components/shell/page-header'
import { resetDemoState, useDemoState } from '@/lib/demo/store'
import { formatDateTime } from '@/lib/demo/util'

export function SystemSettings() {
  const state = useDemoState()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const setup = state.setup
  const rows: [string, string][] = setup
    ? [
        ['Organization', setup.organization],
        ['Tenant id', setup.tenantId],
        ['Operating mode', setup.mode],
        ['Administrator', `${setup.adminName} <${setup.adminEmail}>`],
        ['Object storage', setup.storageProvider],
        ['Embeddings', setup.embeddingMode],
        ['Event streaming', setup.kafkaMode],
        ['Configured', setup.completedAt ? formatDateTime(setup.completedAt) : '-'],
      ]
    : []

  return (
    <>
      <PageHeader title="System Settings" description="Configuration captured by the Setup Wizard." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="flex flex-col gap-3 xl:col-span-2">
          <H3>Configuration</H3>
          {setup ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-all">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Body className="text-muted">Setup has not been completed.</Body>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <H3>Reset all data</H3>
          <Body className="text-muted">
            Permanently removes every document, GridFS binary, audit event and setting from the MongoDB Atlas database.
          </Body>
          {confirming ? (
            <>
              <Banner variant="danger">This cannot be undone.</Banner>
              <div className="flex gap-2">
                <Button onClick={() => setConfirming(false)}>Cancel</Button>
                <Button
                  variant="danger"
                  disabled={resetting}
                  onClick={async () => {
                    setResetting(true)
                    setResetError(null)
                    try {
                      await resetDemoState()
                      router.push('/setup')
                    } catch (error) {
                      setResetError((error as Error).message)
                      setResetting(false)
                    }
                  }}
                >
                  {resetting ? 'Resetting...' : 'Reset everything'}
                </Button>
              </div>
              {resetError && <Banner variant="warning">{resetError}</Banner>}
            </>
          ) : (
            <Button variant="dangerOutline" onClick={() => setConfirming(true)}>
              Reset all data
            </Button>
          )}
        </Card>
      </div>
    </>
  )
}
