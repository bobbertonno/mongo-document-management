'use client'

import { useSyncExternalStore } from 'react'
import { ADMIN_ROLES, permissionsFor, type Permission } from '@/lib/domain/access'
import type { DemoState, User } from '@/lib/domain/types'

// Only the preference of which directory user to act as lives in the browser; users themselves live in Atlas.
const STORAGE_KEY = 'adh:acting-user'
const listeners = new Set<() => void>()
let actingUserId: string | null = null
let loaded = false

function read(): string | null {
  if (!loaded && typeof window !== 'undefined') {
    actingUserId = window.localStorage.getItem(STORAGE_KEY)
    loaded = true
  }
  return actingUserId
}

export function setActingUserId(id: string) {
  actingUserId = id
  loaded = true
  window.localStorage.setItem(STORAGE_KEY, id)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function customRolesOf(state: DemoState) {
  return (state.roles ?? []).filter((r) => !r.builtIn)
}

export function activeUsers(state: DemoState): User[] {
  return state.users.filter((u) => u.status !== 'disabled')
}

/** The selected user, falling back to the first active administrator (the bootstrap admin). */
export function resolveActingUser(state: DemoState, id = read()): User | undefined {
  const active = activeUsers(state)
  return (
    active.find((u) => u._id === id) ??
    active.find((u) => u.roles.some((r) => (ADMIN_ROLES as string[]).includes(r))) ??
    active[0]
  )
}

export function hasPermission(state: DemoState, user: User | undefined, permission: Permission) {
  if (!user || user.status === 'disabled') return false
  return permissionsFor(user, customRolesOf(state)).has(permission)
}

export function useActingUserId() {
  return useSyncExternalStore(subscribe, read, () => null)
}
