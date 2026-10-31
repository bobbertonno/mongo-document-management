'use client'

import { useState } from 'react'
import Modal from '@leafygreen-ui/modal'
import Button from '@leafygreen-ui/button'
import Checkbox from '@leafygreen-ui/checkbox'
import TextInput from '@leafygreen-ui/text-input'
import Banner from '@leafygreen-ui/banner'
import { Option, Select } from '@leafygreen-ui/select'
import { Body, H3 } from '@leafygreen-ui/typography'
import { userInputSchema, type UserInput } from '@/lib/domain/access'
import { DEPARTMENTS, type Department, type User } from '@/lib/domain/types'
import type { RoleSummary } from '@/lib/demo/directory'

const NO_DEPARTMENT = '__none__'

interface UserFormModalProps {
  open: boolean
  user?: User
  roles: RoleSummary[]
  canGrantPlatformAdmin: boolean
  saving: boolean
  onClose: () => void
  onSubmit: (input: UserInput) => void
}

export function UserFormModal({ open, user, roles, canGrantPlatformAdmin, saving, onClose, onSubmit }: UserFormModalProps) {
  const [form, setForm] = useState<UserInput>({
    name: user?.name ?? '',
    email: user?.email ?? '',
    department: user?.department ?? null,
    roles: user?.roles ?? ['Viewer'],
    status: user?.status ?? 'active',
  })
  const [error, setError] = useState<string | null>(null)

  const toggleRole = (id: string, checked: boolean) =>
    setForm((f) => ({ ...f, roles: checked ? [...f.roles, id] : f.roles.filter((r) => r !== id) }))

  const submit = () => {
    const parsed = userInputSchema.safeParse(form)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }
    setError(null)
    onSubmit(parsed.data)
  }

  return (
    <Modal open={open} setOpen={(next) => {
        if (!next) onClose()
      }} size="default">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <H3 as="h2">{user ? `Edit ${user.name}` : 'Add user'}</H3>
        <TextInput label="Full name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <TextInput
          label="Email"
          type="email"
          description="Unique per tenant, compared case-insensitively by an Atlas collation index."
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Department"
            value={form.department ?? NO_DEPARTMENT}
            onChange={(v) => setForm((f) => ({ ...f, department: v === NO_DEPARTMENT ? null : (v as Department) }))}
          >
            <Option value={NO_DEPARTMENT}>No department</Option>
            {DEPARTMENTS.map((d) => (
              <Option key={d} value={d}>
                {d}
              </Option>
            ))}
          </Select>
          <Select
            label="Status"
            value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status: v as UserInput['status'] }))}
          >
            <Option value="active">Active</Option>
            <Option value="disabled">Disabled</Option>
          </Select>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Roles</legend>
          <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
            {roles.map((role) => {
              const locked = role._id === 'PlatformAdmin' && !canGrantPlatformAdmin
              return (
                <Checkbox
                  key={role._id}
                  label={role.name}
                  description={role.builtIn ? 'Built-in' : `Custom - ${role.accessLevel} access`}
                  checked={form.roles.includes(role._id)}
                  disabled={locked}
                  onChange={(e) => toggleRole(role._id, e.target.checked)}
                />
              )
            })}
          </div>
        </fieldset>
        {error && <Banner variant="danger">{error}</Banner>}
        <div className="flex items-center justify-end gap-2">
          <Body className="mr-auto text-xs text-muted">Saved with its audit event in one Atlas transaction.</Body>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving...' : user ? 'Save changes' : 'Add user'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
