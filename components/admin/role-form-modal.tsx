'use client'

import { useState } from 'react'
import Modal from '@leafygreen-ui/modal'
import Button from '@leafygreen-ui/button'
import Checkbox from '@leafygreen-ui/checkbox'
import TextInput from '@leafygreen-ui/text-input'
import Banner from '@leafygreen-ui/banner'
import { Option, Select } from '@leafygreen-ui/select'
import { Body, H3 } from '@leafygreen-ui/typography'
import { PERMISSIONS, PERMISSION_LABELS, roleInputSchema, type RoleInput } from '@/lib/domain/access'
import { ROLES } from '@/lib/domain/types'
import type { RoleSummary } from '@/lib/demo/directory'

const ACCESS_LEVELS = ROLES.filter((r) => r !== 'PlatformAdmin')

interface RoleFormModalProps {
  open: boolean
  role?: RoleSummary
  saving: boolean
  onClose: () => void
  onSubmit: (input: RoleInput) => void
}

export function RoleFormModal({ open, role, saving, onClose, onSubmit }: RoleFormModalProps) {
  const [form, setForm] = useState<RoleInput>({
    name: role?.name ?? '',
    description: role?.description ?? '',
    permissions: role?.permissions ?? [],
    accessLevel: (role?.accessLevel as RoleInput['accessLevel']) ?? 'Viewer',
  })
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const parsed = roleInputSchema.safeParse(form)
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
        <H3 as="h2">{role ? `Edit ${role.name}` : 'Create custom role'}</H3>
        <TextInput label="Role name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <TextInput
          label="Description"
          optional
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <Select
          label="Document access level"
          description="Which classifications members can read, inherited from a built-in role."
          value={form.accessLevel}
          onChange={(v) => setForm((f) => ({ ...f, accessLevel: v as RoleInput['accessLevel'] }))}
        >
          {ACCESS_LEVELS.map((r) => (
            <Option key={r} value={r}>
              {r}
            </Option>
          ))}
        </Select>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Permissions</legend>
          {PERMISSIONS.map((p) => (
            <Checkbox
              key={p}
              label={PERMISSION_LABELS[p].label}
              description={PERMISSION_LABELS[p].description}
              checked={form.permissions.includes(p)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  permissions: e.target.checked ? [...f.permissions, p] : f.permissions.filter((x) => x !== p),
                }))
              }
            />
          ))}
        </fieldset>
        {error && <Banner variant="danger">{error}</Banner>}
        <div className="flex items-center justify-end gap-2">
          <Body className="mr-auto text-xs text-muted">Validated by a $jsonSchema rule on the roles collection.</Body>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving...' : role ? 'Save changes' : 'Create role'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
