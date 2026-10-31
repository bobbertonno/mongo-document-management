'use client'

import type { RoleSummary } from '@/lib/atlas/directory'
import type { RoleInput, UserInput } from '@/lib/domain/access'
import { resolveActingUser } from './actor'
import { getDemoState, reloadState } from './store'

export type { RoleSummary }

export interface DirectoryOverview {
  roles: RoleSummary[]
  features: { name: string; detail: string }[]
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`)
  return body as T
}

export async function fetchDirectory(tenantId: string): Promise<DirectoryOverview> {
  return readJson(await fetch(`/api/atlas/directory?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' }))
}

export type DirectoryAction =
  | { action: 'createUser'; input: UserInput }
  | { action: 'updateUser'; id: string; input: UserInput }
  | { action: 'createRole'; input: RoleInput }
  | { action: 'updateRole'; id: string; input: RoleInput }
  | { action: 'deleteRole'; id: string }

/** Runs a directory change in an Atlas transaction as the acting user, then refreshes local state. */
export async function runDirectoryAction(body: DirectoryAction): Promise<{ id: string }> {
  const state = getDemoState()
  const actor = resolveActingUser(state)
  if (!state.setup?.tenantId || !actor) throw new Error('Setup has not been completed')
  const result = await readJson<{ id: string }>(
    await fetch('/api/atlas/directory', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-actor-id': actor._id },
      body: JSON.stringify({ ...body, tenantId: state.setup.tenantId }),
    }),
  )
  await reloadState()
  return result
}
