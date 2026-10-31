'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Card from '@leafygreen-ui/card'
import { Body, H3 } from '@leafygreen-ui/typography'
import { StoragePanel } from '@/components/setup/storage-panel'
import { useToast } from '@/components/shared/toast'
import { setStorageProvider } from '@/lib/demo/services'
import { describeStorage, fetchStorageStatus, saveStorageSettings } from '@/lib/demo/storage'
import type { StorageConfigInput } from '@/lib/domain/storage'

export function StorageSettings() {
  const { pushToast } = useToast()
  const { data, error, isLoading, mutate } = useSWR('storage-status', fetchStorageStatus, { revalidateOnFocus: false })
  const [saving, setSaving] = useState(false)

  const save = async (config: StorageConfigInput) => {
    setSaving(true)
    try {
      const status = await saveStorageSettings(config)
      await mutate(status, { revalidate: false })
      await setStorageProvider(status.provider, status.s3 && status.provider === 'aws-s3' ? { bucket: status.s3.bucket, region: status.s3.region } : {})
      pushToast({ variant: 'success', title: 'Storage settings saved', description: `New uploads go to ${describeStorage(status)}.` })
    } catch (e) {
      pushToast({ variant: 'warning', title: 'Could not save storage settings', description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="flex flex-col gap-3 xl:col-span-2">
      <H3>Object storage</H3>
      {data || error ? (
        <StoragePanel
          key={data?.updatedAt ?? (error ? 'error' : 'default')}
          status={data}
          loading={isLoading}
          error={error as Error | undefined}
          saving={saving}
          onSave={(config) => void save(config)}
        />
      ) : (
        <Body className="text-sm text-muted">Loading storage settings...</Body>
      )}
    </Card>
  )
}
