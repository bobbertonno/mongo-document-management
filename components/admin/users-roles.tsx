'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Card from '@leafygreen-ui/card'
import Button from '@leafygreen-ui/button'
import Badge from '@leafygreen-ui/badge'
import Banner from '@leafygreen-ui/banner'
import Icon from '@leafygreen-ui/icon'
import { Body, H3 } from '@leafygreen-ui/typography'
import { PageHeader } from '@/components/shell/page-header'
import { useToast } from '@/components/shared/toast'
import { PERMISSION_LABELS, roleName } from '@/lib/domain/access'
import type { User } from '@/lib/domain/types'
import { useDemoState } from '@/lib/demo/store'
import { customRolesOf, hasPermission, resolveActingUser, useActingUserId } from '@/lib/demo/actor'
import { fetchDirectory, runDirectoryAction, type DirectoryAction, type RoleSummary } from '@/lib/demo/directory'
import { UserFormModal } from './user-form-modal'
import { RoleFormModal } from './role-form-modal'

type Editing = { kind: 'user'; user?: User } | { kind: 'role'; role?: RoleSummary } | null

export function UsersRoles() {
  const state = useDemoState()
  const actingId = useActingUserId()
  const actor = resolveActingUser(state, actingId ?? undefined)
  const canManage = hasPermission(state, actor, 'users.manage')
  const tenantId = state.setup?.tenantId
  const { pushToast } = useToast()
  const { data, error, mutate } = useSWR(tenantId ? ['directory', tenantId, state.users.length] : null, ([, t]) => fetchDirectory(t), {
    revalidateOnFocus: false,
  })
  const [editing, setEditing] = useState<Editing>(null)
  const [saving, setSaving] = useState(false)

  const roles = data?.roles ?? []
  const custom = customRolesOf(state)

  const run = async (body: DirectoryAction, success: string) => {
    setSaving(true)
    try {
      await runDirectoryAction(body)
      await mutate()
      setEditing(null)
      pushToast({ variant: 'success', title: success })
    } catch (e) {
      pushToast({ variant: 'warning', title: 'Change rejected', description: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Users & Roles"
        description="The tenant directory lives in the Atlas users and roles collections. Every change is checked against the acting user's permissions and committed with its audit event."
        actions={
          canManage && (
            <>
              <Button leftGlyph={<Icon glyph="Plus" />} onClick={() => setEditing({ kind: 'role' })}>
                New role
              </Button>
              <Button variant="primary" leftGlyph={<Icon glyph="Person" />} onClick={() => setEditing({ kind: 'user' })}>
                Add user
              </Button>
            </>
          )
        }
      />

      {!canManage && (
        <Banner variant="info" className="mb-6">
          You are acting as {actor?.name ?? 'an unknown user'}, who can view the directory but not change it. Switch to an
          administrator from the header to make changes.
        </Banner>
      )}
      {error && (
        <Banner variant="danger" className="mb-6">
          Could not load roles from Atlas: {(error as Error).message}
        </Banner>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="flex flex-col gap-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <H3>Users</H3>
            <Badge variant="lightgray">{state.users.length} total</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Department</th>
                  <th className="py-2 pr-4 font-medium">Roles</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.users.map((user) => (
                  <tr key={user._id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {user.name}
                          {user._id === actor?._id && <span className="ml-2 text-xs text-mdb-green">(you)</span>}
                        </span>
                        <span className="text-xs text-muted">{user.email}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">{user.department ?? '-'}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((r) => (
                          <Badge key={r} variant={custom.some((c) => c._id === r) ? 'blue' : 'lightgray'}>
                            {roleName(r, custom)}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={user.status === 'disabled' ? 'red' : 'green'}>{user.status ?? 'active'}</Badge>
                    </td>
                    <td className="py-3 text-right">
                      {canManage && (
                        <Button size="xsmall" onClick={() => setEditing({ kind: 'user', user })}>
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <H3>Roles</H3>
            {!data && !error && <Body className="text-sm text-muted">Aggregating roles in Atlas...</Body>}
            <ul className="flex flex-col divide-y divide-border">
              {roles.map((role) => (
                <li key={role._id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{role.name}</span>
                      <Badge variant={role.builtIn ? 'lightgray' : 'blue'}>{role.builtIn ? 'Built-in' : 'Custom'}</Badge>
                    </div>
                    <span className="text-xs text-muted">
                      {role.activeMemberCount}/{role.memberCount} active
                    </span>
                  </div>
                  {role.description && <Body className="text-xs text-muted">{role.description}</Body>}
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.length ? (
                      role.permissions.map((p) => (
                        <span key={p} className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted">
                          {PERMISSION_LABELS[p].label}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-muted">Read-only</span>
                    )}
                  </div>
                  {canManage && !role.builtIn && (
                    <div className="flex gap-2">
                      <Button size="xsmall" onClick={() => setEditing({ kind: 'role', role })}>
                        Edit
                      </Button>
                      <Button
                        size="xsmall"
                        variant="dangerOutline"
                        disabled={saving}
                        onClick={() => {
                          if (window.confirm(`Delete ${role.name}? Members without another role become Viewers.`)) {
                            void run({ action: 'deleteRole', id: role._id }, `${role.name} deleted`)
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {data && (
            <Card className="flex flex-col gap-3">
              <H3>Atlas features in use</H3>
              <ul className="flex flex-col gap-2">
                {data.features.map((f) => (
                  <li key={f.name} className="flex flex-col">
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className="text-xs text-muted">{f.detail}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {editing?.kind === 'user' && (
        <UserFormModal
          open
          user={editing.user}
          roles={roles}
          canGrantPlatformAdmin={!!actor?.roles.includes('PlatformAdmin')}
          saving={saving}
          onClose={() => setEditing(null)}
          onSubmit={(input) =>
            void run(
              editing.user ? { action: 'updateUser', id: editing.user._id, input } : { action: 'createUser', input },
              editing.user ? `${input.name} updated` : `${input.name} added`,
            )
          }
        />
      )}
      {editing?.kind === 'role' && (
        <RoleFormModal
          open
          role={editing.role}
          saving={saving}
          onClose={() => setEditing(null)}
          onSubmit={(input) =>
            void run(
              editing.role ? { action: 'updateRole', id: editing.role._id, input } : { action: 'createRole', input },
              editing.role ? `${input.name} updated` : `${input.name} created`,
            )
          }
        />
      )}
    </>
  )
}
