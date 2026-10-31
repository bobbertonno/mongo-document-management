'use client'

import Badge from '@leafygreen-ui/badge'
import type { Classification, DocumentStatus } from '@/lib/domain/types'

const CLASSIFICATION_VARIANT: Record<Classification, 'lightgray' | 'blue' | 'yellow' | 'red'> = {
  Public: 'lightgray',
  Internal: 'blue',
  Confidential: 'yellow',
  Restricted: 'red',
}

export function ClassificationBadge({ value }: { value: Classification }) {
  return <Badge variant={CLASSIFICATION_VARIANT[value]}>{value}</Badge>
}

export function StatusBadge({ value, deleted }: { value: DocumentStatus; deleted?: boolean }) {
  if (deleted) return <Badge variant="darkgray">Deleted</Badge>
  const variant = value === 'Ready' || value === 'Approved' ? 'green' : value === 'Failed' || value === 'Rejected' ? 'red' : 'blue'
  return <Badge variant={variant}>{value}</Badge>
}

export function EngineNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted">
      <span className="inline-block h-2 w-2 rounded-full bg-[#ffc010]" aria-hidden="true" />
      {children}
    </p>
  )
}
