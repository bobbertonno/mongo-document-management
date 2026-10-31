'use client'

import { createStore, del, get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import type { DemoState } from '@/lib/domain/types'

const STATE_KEY = 'atlas-document-hub:state:v1'

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

let state: DemoState = emptyState()
let loaded = false
let loadPromise: Promise<void> | null = null
const listeners = new Set<() => void>()
let persistQueue: Promise<void> = Promise.resolve()

function emit() {
  for (const listener of listeners) listener()
}

export function loadDemoState(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const persisted = await get<DemoState>(STATE_KEY, metaStore())
    if (persisted && persisted.schemaVersion === 1) state = { ...emptyState(), ...persisted }
    loaded = true
    emit()
  })()
  return loadPromise
}

export function getDemoState(): DemoState {
  return state
}

/**
 * Applies a mutation as a single unit: the document change, its audit event and
 * its outbox event are committed together, mirroring a MongoDB transaction.
 */
export async function commit(mutator: (draft: DemoState) => void): Promise<void> {
  const draft = structuredClone(state)
  mutator(draft)
  state = draft
  emit()
  const snapshot = state
  persistQueue = persistQueue.then(() => set(STATE_KEY, snapshot, metaStore()))
  await persistQueue
}

export async function resetDemoState(): Promise<void> {
  state = emptyState()
  emit()
  await set(STATE_KEY, state, metaStore())
  const { clear } = await import('idb-keyval')
  await clear(blobStore())
}

export async function putObject(objectKey: string, blob: Blob): Promise<void> {
  await set(objectKey, blob, blobStore())
}
export async function getObject(objectKey: string): Promise<Blob | undefined> {
  return get<Blob>(objectKey, blobStore())
}
export async function deleteObject(objectKey: string): Promise<void> {
  await del(objectKey, blobStore())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribe, getDemoState, getServerState)
}

export function useDemoLoaded(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => loaded,
    () => false,
  )
}
