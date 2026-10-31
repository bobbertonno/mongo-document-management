'use client'

import Badge from '@leafygreen-ui/badge'
import Icon from '@leafygreen-ui/icon'
import { roleName } from '@/lib/domain/access'
import { activeUsers, customRolesOf, resolveActingUser, setActingUserId, useActingUserId } from '@/lib/demo/actor'
import { useDemoState } from '@/lib/demo/store'

export function ActingUserSwitcher() {
  const state = useDemoState()
  const actingId = useActingUserId()
  const actor = resolveActingUser(state, actingId ?? undefined)
  const users = activeUsers(state)
  const custom = customRolesOf(state)

  return (
    <div className="flex items-center gap-2 border-l border-border pl-3">
      <Icon glyph="Person" aria-hidden="true" />
      <label htmlFor="acting-user" className="sr-only">
        Acting as
      </label>
      <select
        id="acting-user"
        value={actor?._id ?? ''}
        onChange={(e) => setActingUserId(e.target.value)}
        className="max-w-44 rounded border border-border bg-surface px-2 py-1 text-[13px]"
      >
        {users.map((u) => (
          <option key={u._id} value={u._id}>
            {u.name}
          </option>
        ))}
      </select>
      {actor?.roles[0] && <Badge variant="lightgray">{roleName(actor.roles[0], custom)}</Badge>}
    </div>
  )
}
