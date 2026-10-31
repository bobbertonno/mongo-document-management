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
          <H3>Reset demo data</H3>
          <Body className="text-muted">Permanently removes every document, binary, audit event and setting stored in this browser.</Body>
          {confirming ? (
            <>
              <Banner variant="danger">This cannot be undone.</Banner>
              <div className="flex gap-2">
                <Button onClick={() => setConfirming(false)}>Cancel</Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await resetDemoState()
                    router.push('/setup')
                  }}
                >
                  Reset everything
                </Button>
              </div>
            </>
          ) : (
            <Button variant="dangerOutline" onClick={() => setConfirming(true)}>
              Reset demo data
            </Button>
          )}
        </Card>
      </div>
    </>
  )
}
