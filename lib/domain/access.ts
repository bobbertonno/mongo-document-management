import { z } from 'zod'
import { DEPARTMENTS, ROLES, type Role, type User } from './types'

export const PERMISSIONS = [
  'documents.create',
  'documents.edit',
  'documents.delete',
  'documents.generate',
  'audit.view',
  'users.manage',
  'settings.manage',
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  'documents.create': { label: 'Upload documents', description: 'Create documents and run the ingestion pipeline' },
  'documents.edit': { label: 'Edit documents', description: 'Change metadata and upload new versions' },
  'documents.delete': { label: 'Delete documents', description: 'Soft delete, restore and clean up datasets' },
  'documents.generate': { label: 'Generate datasets', description: 'Use the document generator' },
  'audit.view': { label: 'View audit trail', description: 'Open the Audit Explorer' },
  'users.manage': { label: 'Manage users & roles', description: 'Create users, assign roles and define custom roles' },
  'settings.manage': { label: 'Manage system settings', description: 'Change storage and vector search configuration' },
}

export interface RoleDefinition {
  _id: string
  tenantId: string
  name: string
  description: string
  permissions: Permission[]
  /** Built-in role whose document access rank this role inherits. */
  accessLevel: Role
  builtIn: boolean
  createdAt: string
  updatedAt: string
}

const ALL: Permission[] = [...PERMISSIONS]

export const BUILTIN_ROLES: Record<Role, { description: string; permissions: Permission[] }> = {
  PlatformAdmin: { description: 'Full control across the platform', permissions: ALL },
  TenantAdmin: { description: 'Full control of this tenant', permissions: ALL },
  ComplianceAuditor: { description: 'Reads restricted content and the audit trail', permissions: ['audit.view'] },
  DepartmentManager: {
    description: 'Owns documents for a department',
    permissions: ['documents.create', 'documents.edit', 'documents.delete', 'documents.generate', 'audit.view'],
  },
  Approver: { description: 'Reviews and edits documents', permissions: ['documents.edit'] },
  Editor: { description: 'Uploads and edits documents', permissions: ['documents.create', 'documents.edit', 'documents.generate'] },
  Viewer: { description: 'Read-only access', permissions: [] },
}

export const ADMIN_ROLES: Role[] = ['PlatformAdmin', 'TenantAdmin']

export const ROLE_RANK: Record<Role, number> = Object.fromEntries(ROLES.map((r, i) => [r, ROLES.length - i])) as Record<Role, number>

export function isBuiltInRole(id: string): id is Role {
  return (ROLES as readonly string[]).includes(id)
}

export function builtInRoleDefinition(role: Role, tenantId: string, at: string): RoleDefinition {
  return {
    _id: role,
    tenantId,
    name: role,
    description: BUILTIN_ROLES[role].description,
    permissions: BUILTIN_ROLES[role].permissions,
    accessLevel: role,
    builtIn: true,
    createdAt: at,
    updatedAt: at,
  }
}

type RoleLookup = Pick<RoleDefinition, '_id' | 'permissions' | 'accessLevel'>

/** Built-in definitions always come from code; custom ones from the `roles` collection. */
function resolveRole(id: string, customRoles: RoleLookup[]): RoleLookup | undefined {
  if (isBuiltInRole(id)) return { _id: id, permissions: BUILTIN_ROLES[id].permissions, accessLevel: id }
  return customRoles.find((r) => r._id === id)
}

export function permissionsFor(user: Pick<User, 'roles'>, customRoles: RoleLookup[]): Set<Permission> {
  const result = new Set<Permission>()
  for (const id of user.roles) for (const p of resolveRole(id, customRoles)?.permissions ?? []) result.add(p)
  return result
}

export function accessRankFor(user: Pick<User, 'roles'>, customRoles: RoleLookup[]): number {
  let best = 0
  for (const id of user.roles) {
    const role = resolveRole(id, customRoles)
    if (role) best = Math.max(best, ROLE_RANK[role.accessLevel])
  }
  return best
}

export function roleName(id: string, customRoles: Pick<RoleDefinition, '_id' | 'name'>[]): string {
  return isBuiltInRole(id) ? id : (customRoles.find((r) => r._id === id)?.name ?? 'Unknown role')
}

export const USER_STATUSES = ['active', 'disabled'] as const

export const userInputSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  email: z.email('Enter a valid email').max(160),
  department: z.enum(DEPARTMENTS).nullable(),
  roles: z.array(z.string().min(1).max(64)).min(1, 'Assign at least one role').max(10),
  status: z.enum(USER_STATUSES),
})
export type UserInput = z.infer<typeof userInputSchema>

export const roleInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Role name is required')
    .max(48)
    .regex(/^[A-Za-z][A-Za-z0-9 _-]*$/, 'Use letters, numbers, spaces, dashes or underscores'),
  description: z.string().trim().max(200),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  accessLevel: z.enum(ROLES).exclude(['PlatformAdmin']),
})
export type RoleInput = z.infer<typeof roleInputSchema>
