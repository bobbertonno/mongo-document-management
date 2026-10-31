'use client'

import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import { Body, H3 } from '@leafygreen-ui/typography'
import { PageHeader } from '@/components/shell/page-header'

const LAYERS = [
  {
    name: 'Presentation',
    demo: 'Next.js App Router + LeafyGreen UI',
    atlas: 'Same UI, served from Vercel',
    items: ['Dashboard', 'Document Library', 'Search', 'Generator', 'Audit Explorer'],
  },
  {
    name: 'Application services',
    demo: 'Service module calling Atlas Route Handlers',
    atlas: 'Full server-side domain logic in Route Handlers',
    items: ['Validation (zod)', 'Authorization', 'Optimistic concurrency', 'Ingestion pipeline'],
  },
  {
    name: 'Persistence',
    demo: 'MongoDB Atlas collections + GridFS (transactional writes)',
    atlas: 'Optional S3 offload for large binaries',
    items: ['documents', 'documentVersions', 'documentChunks', 'auditEvents', 'outboxEvents', 'generationRuns'],
  },
  {
    name: 'Search',
    demo: 'BM25 over chunks loaded from Atlas, ACL pre-filter',
    atlas: 'Atlas Search + Atlas Vector Search ($rankFusion)',
    items: ['Metadata', 'Full text', 'Semantic (needs embeddings)', 'Hybrid'],
  },
  {
    name: 'Events',
    demo: 'Transactional outbox stored in Atlas, unpublished',
    atlas: 'Change Streams / outbox relay to Kafka',
    items: ['document.uploaded', 'document.indexed', 'document.updated', 'document.deleted'],
  },
]

const GUARANTEES = [
  ['Atomic commits', 'Document, versions, chunks, audit and outbox entries are written in one commit.'],
  ['Integrity', 'Every binary is SHA-256 checksummed at upload and re-verified on every preview and download.'],
  ['Access control', 'Classification derives an access policy; chunks carry effective access tokens so search filters before ranking.'],
  ['Concurrency', 'Mutations require the expected concurrencyVersion and fail on conflicting writes.'],
  ['Determinism', 'Generated datasets are a pure function of (seed, index) and resume from checkpoints.'],
]

export function ArchitectureOverview() {
  return (
    <>
      <PageHeader title="Architecture Overview" description="How each layer runs on MongoDB Atlas today and where it is headed next." />
      <ol className="flex flex-col gap-3">
        {LAYERS.map((l, i) => (
          <li key={l.name}>
            <Card className="grid gap-4 !p-4 md:grid-cols-[200px_1fr_1fr]">
              <div className="flex items-start gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#001e2b] text-xs font-semibold text-[#00ed64]">
                  {i + 1}
                </span>
                <div>
                  <H3 className="!text-base">{l.name}</H3>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {l.items.map((it) => (
                      <span key={it} className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        {it}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1 border-border md:border-l md:pl-4">
                <Badge variant="green" className="self-start">
                  Implemented
                </Badge>
                <Body>{l.demo}</Body>
              </div>
              <div className="flex flex-col gap-1 border-border md:border-l md:pl-4">
                <Badge variant="lightgray" className="self-start">
                  Roadmap
                </Badge>
                <Body>{l.atlas}</Body>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <Card className="mt-6 flex flex-col gap-3">
        <H3>Guarantees enforced today</H3>
        <dl className="grid gap-4 md:grid-cols-2">
          {GUARANTEES.map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm font-semibold">{k}</dt>
              <dd className="text-sm text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  )
}
