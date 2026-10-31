'use client'

import { createStore, del, get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import type { DemoState, OperatingMode } from '@/lib/domain/types'

const STATE_KEY = 'atlas-document-hub:state:v1'
const BACKEND_KEY = 'atlas-document-hub:backend'

type CollectionKey = Exclude<keyof DemoState, 'schemaVersion' | 'setup'>
const COLLECTION_ID_FIELDS: Record<CollectionKey, string> = {
  users: '_id',
  folders: '_id',
  documents: '_id',
  documentVersions: '_id',
  documentChunks: '_id',
  auditEvents: 'eventId',
  outboxEvents: '_id',
  generationRuns: '_id',
}
const COLLECTION_KEYS = Object.keys(COLLECTION_ID_FIELDS) as CollectionKey[]

const emptyState = (): DemoState => ({
  schemaVersion: 1,
  setup: null,
  users: [],
  folders: [],
  documents: [],
  documentVersions: [],
  documentChunks: [],
  auditEvents: [],
  outboxEvents: [],
  generationRuns: [],
})

let idbStore: ReturnType<typeof createStore> | null = null
const metaStore = () => (idbStore ??= createStore('atlas-document-hub', 'records'))
let binaryStore: ReturnType<typeof createStore> | null = null
const blobStore = () => (binaryStore ??= createStore('atlas-document-hub-objects', 'objects'))

const serverState = emptyState()
const getServerState = () => serverState

export interface StoreStatus {
  loaded: boolean
  backend: OperatingMode
  error: string | null
}

let state: DemoState = emptyState()
let status: StoreStatus = { loaded: false, backend: 'demo', error: null }
let loadPromise: Promise<void> | null = null
const listeners = new Set<() => void>()
let persistQueue: Promise<void> = Promise.resolve()

function emit() {
  for (const listener of listeners) listener()
}

function setStatus(patch: Partial<StoreStatus>) {
  status = { ...status, ...patch }
  emit()
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`)
  return body as T
}

async function fetchAtlasState(): Promise<DemoState> {
  const remote = await readJson<DemoState>(await fetch('/api/atlas/state', { cache: 'no-store' }))
  return { ...emptyState(), ...remote, schemaVersion: 1 }
}

export interface AtlasStatus {
  configured: boolean
  connected: boolean
  database: string | null
  latencyMs?: number
  setupCompleted?: boolean
  error?: string
}

export async function fetchAtlasStatus(): Promise<AtlasStatus> {
  try {
    return await readJson<AtlasStatus>(await fetch('/api/atlas/status', { cache: 'no-store' }))
  } catch (error) {
    return { configured: false, connected: false, database: null, error: (error as Error).message }
  }
}

async function loadBackend(backend: OperatingMode) {
  if (backend === 'atlas') {
    state = await fetchAtlasState()
  } else {
    const persisted = await get<DemoState>(STATE_KEY, metaStore())
    state = persisted && persisted.schemaVersion === 1 ? { ...emptyState(), ...persisted } : emptyState()
  }
}

export function loadDemoState(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    try {
      let backend = await get<OperatingMode>(BACKEND_KEY, metaStore())
      if (!backend) {
        const local = await get<DemoState>(STATE_KEY, metaStore())
        // A fresh browser joins an existing Atlas tenant instead of starting a new demo.
        if (!local?.setup?.completed) {
          const atlas = await fetchAtlasStatus()
          if (atlas.connected && atlas.setupCompleted) backend = 'atlas'
        }
      }
      backend ??= 'demo'
      await loadBackend(backend)
      setStatus({ loaded: true, backend, error: null })
    } catch (error) {
      setStatus({ loaded: true, backend: 'atlas', error: (error as Error).message })
    }
  })()
  return loadPromise
}

/** Selects the persistence engine before setup runs. Atlas Mode starts from the cluster's current data. */
export async function selectBackend(backend: OperatingMode): Promise<void> {
  await loadBackend(backend)
  await set(BACKEND_KEY, backend, metaStore())
  setStatus({ backend, error: null })
}

export function getDemoState(): DemoState {
  return state
}

export function getBackend(): OperatingMode {
  return status.backend
}

function diffState(prev: DemoState, next: DemoState) {
  const upserts: Partial<Record<CollectionKey, unknown[]>> = {}
  const deletes: Partial<Record<CollectionKey, string[]>> = {}
  for (const key of COLLECTION_KEYS) {
    const idField = COLLECTION_ID_FIELDS[key]
    const previous = new Map<string, string>()
    for (const record of prev[key] as unknown as Record<string, unknown>[]) {
      previous.set(record[idField] as string, JSON.stringify(record))
    }
    const changed: unknown[] = []
    for (const record of next[key] as unknown as Record<string, unknown>[]) {
      const id = record[idField] as string
      const before = previous.get(id)
      previous.delete(id)
      if (before === undefined || before !== JSON.stringify(record)) changed.push(record)
    }
    if (changed.length) upserts[key] = changed
    if (previous.size) deletes[key] = [...previous.keys()]
  }
  const setupChanged = JSON.stringify(prev.setup) !== JSON.stringify(next.setup)
  return { upserts, deletes, setup: setupChanged ? next.setup : undefined }
}

async function persistToAtlas(changes: ReturnType<typeof diffState>) {
  const hasChanges = changes.setup !== undefined || Object.keys(changes.upserts).length || Object.keys(changes.deletes).length
  if (!hasChanges) return
  await readJson(
    await fetch('/api/atlas/state', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(changes),
    }),
  )
}

/**
 * Applies a mutation as a single unit: the document change, its audit event and
 * its outbox event are committed together. In Atlas Mode the changed records are
 * written in one MongoDB transaction; in Demo Mode the snapshot goes to IndexedDB.
 */
export async function commit(mutator: (draft: DemoState) => void): Promise<void> {
  const previous = state
  const draft = structuredClone(state)
  mutator(draft)
  state = draft
  emit()
  if (status.backend === 'atlas') {
    const changes = diffState(previous, draft)
    const write = persistQueue.then(() => persistToAtlas(changes))
    persistQueue = write.catch(() => undefined)
    try {
      await write
    } catch (error) {
      // Re-sync with the cluster so the UI never shows records that failed to persist.
      state = await fetchAtlasState().catch(() => previous)
      emit()
      throw error
    }
    return
  }
  const snapshot = state
  persistQueue = persistQueue.then(() => set(STATE_KEY, snapshot, metaStore()))
  await persistQueue
}

export async function resetDemoState(): Promise<void> {
  if (status.backend === 'atlas') {
    await readJson(await fetch('/api/atlas/state', { method: 'DELETE' }))
  } else {
    await set(STATE_KEY, emptyState(), metaStore())
    const { clear } = await import('idb-keyval')
    await clear(blobStore())
  }
  await del(BACKEND_KEY, metaStore())
  state = emptyState()
  setStatus({ backend: 'demo', error: null })
}

const objectUrl = (objectKey: string) => `/api/atlas/objects?key=${encodeURIComponent(objectKey)}`

export async function putObject(objectKey: string, blob: Blob): Promise<void> {
  if (status.backend === 'atlas') {
    await readJson(
      await fetch(objectUrl(objectKey), {
        method: 'PUT',
        headers: { 'content-type': blob.type || 'application/octet-stream' },
        body: blob,
      }),
    )
    return
  }
  await set(objectKey, blob, blobStore())
}

export async function getObject(objectKey: string): Promise<Blob | undefined> {
  if (status.backend === 'atlas') {
    const response = await fetch(objectUrl(objectKey), { cache: 'no-store' })
    if (response.status === 404) return undefined
    if (!response.ok) await readJson(response)
    return response.blob()
  }
  return get<Blob>(objectKey, blobStore())
}

export async function deleteObject(objectKey: string): Promise<void> {
  if (status.backend === 'atlas') {
    await readJson(await fetch(objectUrl(objectKey), { method: 'DELETE' }))
    return
  }
  await del(objectKey, blobStore())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, getDemoState, getServerState)
}

const serverStatus: StoreStatus = { loaded: false, backend: 'demo', error: null }

export function useStoreStatus(): StoreStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => serverStatus,
  )
}

export function useDemoLoaded(): boolean {
  return useStoreStatus().loaded
}
