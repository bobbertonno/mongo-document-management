'use client'

import { useSyncExternalStore } from 'react'
import type { DemoState } from '@/lib/domain/types'

type CollectionKey = Exclude<keyof DemoState, 'schemaVersion' | 'setup'>
const COLLECTION_ID_FIELDS: Record<CollectionKey, string> = {
  users: '_id',
  roles: '_id',
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
  roles: [],
  folders: [],
  documents: [],
  documentVersions: [],
  documentChunks: [],
  auditEvents: [],
  outboxEvents: [],
  generationRuns: [],
})

const serverState = emptyState()
const getServerState = () => serverState

export interface StoreStatus {
  loaded: boolean
  error: string | null
}

let state: DemoState = emptyState()
let status: StoreStatus = { loaded: false, error: null }
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

/** Loads every collection from MongoDB Atlas. Failed loads can be retried. */
export function loadDemoState(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    try {
      state = await fetchAtlasState()
      setStatus({ loaded: true, error: null })
    } catch (error) {
      loadPromise = null
      setStatus({ loaded: true, error: (error as Error).message })
    }
  })()
  return loadPromise
}

/** Re-reads the cluster so decisions (e.g. setup) are made against current data. */
export async function reloadState(): Promise<void> {
  state = await fetchAtlasState()
  setStatus({ error: null })
}

export function getDemoState(): DemoState {
  return state
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
 * Applies a mutation as a single unit: the changed records (document, audit event,
 * outbox event, ...) are written to MongoDB Atlas in one transaction.
 */
export async function commit(mutator: (draft: DemoState) => void): Promise<void> {
  const previous = state
  const draft = structuredClone(state)
  mutator(draft)
  state = draft
  emit()
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
}

export async function resetDemoState(): Promise<void> {
  await readJson(await fetch('/api/atlas/state', { method: 'DELETE' }))
  state = emptyState()
  setStatus({ error: null })
}

const objectUrl = (objectKey: string) => `/api/atlas/objects?key=${encodeURIComponent(objectKey)}`

export async function putObject(objectKey: string, blob: Blob): Promise<void> {
  await readJson(
    await fetch(objectUrl(objectKey), {
      method: 'PUT',
      headers: { 'content-type': blob.type || 'application/octet-stream' },
      body: blob,
    }),
  )
}

export async function getObject(objectKey: string): Promise<Blob | undefined> {
  const response = await fetch(objectUrl(objectKey), { cache: 'no-store' })
  if (response.status === 404) return undefined
  if (!response.ok) await readJson(response)
  return response.blob()
}

export async function deleteObject(objectKey: string): Promise<void> {
  await readJson(await fetch(objectUrl(objectKey), { method: 'DELETE' }))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, getDemoState, getServerState)
}

const serverStatus: StoreStatus = { loaded: false, error: null }

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
