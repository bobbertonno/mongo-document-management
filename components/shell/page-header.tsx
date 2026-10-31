'use client'

import type { ReactNode } from 'react'
import { Body, H2 } from '@leafygreen-ui/typography'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-1">
        <H2 as="h1">{title}</H2>
        {description && <Body className="max-w-3xl text-muted">{description}</Body>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
