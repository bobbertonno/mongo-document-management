import type { GlyphName } from '@leafygreen-ui/icon'

export interface NavItem {
  label: string
  href: string
  implemented: boolean
}
export interface NavGroup {
  header: string
  glyph: GlyphName
  items: NavItem[]
}

const planned = (label: string, slug: string): NavItem => ({ label, href: `/planned/${slug}`, implemented: false })

export const NAV: NavGroup[] = [
  {
    header: 'Overview',
    glyph: 'Dashboard',
    items: [
      { label: 'Dashboard', href: '/', implemented: true },
      { label: 'Activity Feed', href: '/activity', implemented: true },
    ],
  },
  {
    header: 'Documents',
    glyph: 'File',
    items: [
      { label: 'Document Library', href: '/documents', implemented: true },
      { label: 'Intelligent Search', href: '/search', implemented: true },
      { label: 'Upload Center', href: '/documents/upload', implemented: true },
      { label: 'Document Generator', href: '/generator', implemented: true },
    ],
  },
  {
    header: 'Workflows',
    glyph: 'Diagram3',
    items: [
      planned('Workflow Dashboard', 'workflow-dashboard'),
      planned('Workflow Designer', 'workflow-designer'),
      planned('My Approvals', 'my-approvals'),
      planned('Workflow History', 'workflow-history'),
    ],
  },
  {
    header: 'Event Streaming',
    glyph: 'Streaming',
    items: [
      planned('Kafka Simulator', 'kafka-simulator'),
      { label: 'Topic Explorer', href: '/events', implemented: true },
      planned('Event Monitor', 'event-monitor'),
      planned('Dead Letter Queue', 'dead-letter-queue'),
    ],
  },
  {
    header: 'Governance',
    glyph: 'Shield',
    items: [
      { label: 'Audit Explorer', href: '/audit', implemented: true },
      planned('Compliance Dashboard', 'compliance-dashboard'),
      planned('Retention Policies', 'retention-policies'),
    ],
  },
  {
    header: 'Architecture',
    glyph: 'Diagram',
    items: [
      { label: 'Architecture Overview', href: '/architecture', implemented: true },
      planned('MongoDB Capabilities', 'mongodb-capabilities'),
      planned('Data Flows', 'data-flows'),
      planned('Data Model', 'data-model'),
      planned('Search Architecture', 'search-architecture'),
      planned('Event-Driven Architecture', 'event-driven-architecture'),
      planned('Workflow Architecture', 'workflow-architecture'),
      planned('Security & Governance', 'security-governance'),
      planned('Live Execution Traces', 'live-execution-traces'),
    ],
  },
  {
    header: 'Administration',
    glyph: 'Settings',
    items: [
      planned('Users & Roles', 'users-roles'),
      planned('Integrations', 'integrations'),
      { label: 'System Settings', href: '/admin/settings', implemented: true },
      { label: 'Setup Wizard', href: '/setup', implemented: true },
      { label: 'System Health', href: '/admin/health', implemented: true },
      { label: 'Implementation Status', href: '/status', implemented: true },
    ],
  },
]

export const PLANNED_PAGES = Object.fromEntries(
  NAV.flatMap((g) => g.items.filter((i) => !i.implemented).map((i) => [i.href.replace('/planned/', ''), { ...i, group: g.header }])),
)
