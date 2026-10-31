# MongoDB Document Management System

A document management console built with Next.js 16, React 19 and MongoDB's LeafyGreen design system. It shows how a MongoDB-backed document platform would handle storage, versioning, search, auditing and event streaming.

> **Current status: Demo Mode only.** No database, file storage or environment variables are configured. All data is stored in your browser (IndexedDB) and search runs locally. Atlas Mode is shown in the setup wizard but is disabled until a backend exists (see [Atlas Mode](#atlas-mode)).

## Getting started

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The first visit goes to the **Setup Wizard** (`/setup`). Finish it in Demo Mode, then use the **Document Generator** (`/generator`) to create a sample dataset.

| Script       | Description              |
| ------------ | ------------------------ |
| `pnpm dev`   | Start the dev server     |
| `pnpm build` | Build for production     |
| `pnpm start` | Serve the production build |

## Features

| Area           | Route                          | What it does |
| -------------- | ------------------------------ | ------------ |
| Dashboard      | `/`                            | Counts, charts and recent activity |
| Activity Feed  | `/activity`                    | Timeline of system and user actions |
| Document Library | `/documents`                 | Browse, filter and sort documents |
| Document Detail | `/documents/[id]`             | Metadata, versions, preview and audit history for one document |
| Upload Center  | `/documents/upload`            | Upload files with metadata |
| Intelligent Search | `/search`                  | Local full-text search, with the equivalent MongoDB Search queries shown next to it |
| Document Generator | `/generator`               | Creates realistic sample documents, including PDFs |
| Topic Explorer | `/events`                      | Browse simulated event-stream topics and messages |
| Audit Explorer | `/audit`                       | Search and inspect the audit trail |
| Architecture Overview | `/architecture`         | Interactive diagram of the target Atlas architecture |
| System Settings | `/admin/settings`             | Demo configuration and data reset |
| System Health  | `/admin/health`                | Storage and component status |
| Setup Wizard   | `/setup`                       | First-run configuration |
| Implementation Status | `/status`               | Which modules are built and which are planned |

Sidebar items for modules that aren't built yet (workflows, Kafka simulator, compliance, retention, users and roles, and so on) open a placeholder page at `/planned/[slug]`. The full list is in `lib/navigation.ts`.

## Project structure

```
app/                 Routes (App Router)
components/
  shell/             App shell, sidebar navigation, page header
  setup/             Setup wizard
  dashboard/         Dashboard
  documents/         Library, upload form, detail view, metadata fields
  search/            Search workbench
  generator/         Sample data generator
  audit/             Audit explorer
  events/            Topic explorer
  architecture/      Architecture diagram
  admin/             Settings, health, implementation status
  shared/            Badges, toast notifications
lib/
  domain/types.ts    Domain model (documents, versions, audit entries, events)
  demo/store.ts      IndexedDB-backed store
  demo/services.ts   Document, version, audit and event logic
  demo/search.ts     Local search engine
  demo/generator.ts  Sample dataset generator
  demo/pdf.ts        Client-side PDF creation
  navigation.ts      Sidebar structure and planned pages
```

## Data and persistence

- All records and uploaded files are kept in your browser's IndexedDB using `idb-keyval`.
- Data belongs to one browser profile. Clearing site data or using another browser starts fresh.
- **System Settings** can reset the demo data.
- Nothing is sent to a server. Don't use Demo Mode for real or sensitive documents.

## Atlas Mode

Atlas Mode is disabled on purpose in `components/setup/setup-wizard.tsx`. There is no server-side code for it yet. Enabling it requires:

1. **MongoDB Atlas.** Connect the integration so `MONGODB_URI` is set. The `mongodb` driver is already installed.
2. **File storage.** Vercel Blob, Amazon S3, or MongoDB GridFS (GridFS needs no extra service).
3. **Server routes.** Route handlers or server actions that save documents, versions, audit entries and events to MongoDB, plus full-text search through MongoDB Search. Semantic search would also need embeddings (for example Voyage AI) and a vector search index.
4. **Unlocking the option.** Allow Atlas Mode in the wizard only when `MONGODB_URI` is set.

## Known issues

- `tsc` reports type errors because LeafyGreen's type definitions don't match React 19. They don't affect the running app, and `next.config.mjs` ignores type errors during builds.
- LeafyGreen's Toast uses `findDOMNode`, which React 19 removed. It's replaced by `components/shared/toast.tsx`, which has the same API.

## Tech stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · LeafyGreen UI · Tailwind CSS 4 · Recharts · React Flow (`@xyflow/react`) · SWR · Zod · idb-keyval
