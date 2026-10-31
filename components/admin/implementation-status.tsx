'use client'

import Link from 'next/link'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import { H3 } from '@leafygreen-ui/typography'
import { PageHeader } from '@/components/shell/page-header'
import { NAV } from '@/lib/navigation'

export function ImplementationStatus() {
  const all = NAV.flatMap((g) => g.items)
  const done = all.filter((i) => i.implemented).length
  return (
    <>
      <PageHeader title="Implementation Status" description={`${done} of ${all.length} screens implemented. Planned screens are labeled honestly.`} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {NAV.map((g) => (
          <Card key={g.header} className="flex flex-col gap-3 !p-4">
            <H3 className="!text-base">{g.header}</H3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {g.items.map((i) => (
                <li key={i.href} className="flex items-center justify-between gap-2">
                  <Link href={i.href} className="hover:underline">
                    {i.label}
                  </Link>
                  <Badge variant={i.implemented ? 'green' : 'lightgray'}>{i.implemented ? 'Live' : 'Planned'}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  )
}
