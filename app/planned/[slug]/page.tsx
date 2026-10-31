import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/shell/page-header'
import { PLANNED_PAGES } from '@/lib/navigation'

export default async function PlannedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = PLANNED_PAGES[slug]
  if (!page) notFound()
  return (
    <>
      <PageHeader title={page.label} description={`${page.group} - planned`} />
      <div className="rounded-lg border border-dashed border-border bg-white p-8 text-sm text-muted">
        <p>This screen is planned and not yet implemented. No mock data is shown in its place.</p>
        <Link href="/status" className="mt-3 inline-block font-medium text-mdb-green hover:underline">
          View implementation status
        </Link>
      </div>
    </>
  )
}
