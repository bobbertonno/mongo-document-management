import { randomBytes } from 'node:crypto'
import type { ClientSession, Db, Document } from 'mongodb'
import { ROLES, type User } from '@/lib/domain/types'
import { ADMIN_ROLES, PERMISSIONS, builtInRoleDefinition, permissionsFor, type Permission, type RoleDefinition } from '@/lib/domain/access'
import { COLLECTIONS } from './client'

const USERS = COLLECTIONS.users.name
const ROLES_COLLECTION = COLLECTIONS.roles.name
const AUDIT = COLLECTIONS.auditEvents.name

type StringIdDoc = Document & { _id: string }

/** Case-insensitive comparison, so `Ana@Corp.com` and `ana@corp.com` collide on the unique index. */
export const CASE_INSENSITIVE = { locale: 'en', strength: 2 } as const

const USER_SCHEMA = {
  bsonType: 'object',
  required: ['_id', 'tenantId', 'name', 'email', 'roles'],
  properties: {
    _id: { bsonType: 'string' },
    tenantId: { bsonType: 'string' },
    name: { bsonType: 'string', minLength: 2, maxLength: 80 },
    email: { bsonType: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
    roles: { bsonType: 'array', minItems: 1, maxItems: 10, items: { bsonType: 'string' } },
    department: { bsonType: ['string', 'null'] },
    status: { enum: ['active', 'disabled'] },
  },
}

const ROLE_SCHEMA = {
  bsonType: 'object',
  required: ['_id', 'tenantId', 'name', 'permissions', 'accessLevel', 'builtIn'],
  properties: {
    _id: { bsonType: 'string' },
    tenantId: { bsonType: 'string' },
    name: { bsonType: 'string', minLength: 2, maxLength: 48 },
    description: { bsonType: 'string', maxLength: 200 },
    permissions: { bsonType: 'array', items: { enum: [...PERMISSIONS] } },
    accessLevel: { enum: [...ROLES] },
    builtIn: { bsonType: 'bool' },
  },
}

export const ATLAS_FEATURES = [
  { name: '$jsonSchema validation', detail: 'users and roles reject malformed documents at the database layer' },
  { name: 'Unique index with collation', detail: 'one account per email per tenant, case-insensitive' },
  { name: 'Multikey index', detail: 'users.roles is indexed so role membership lookups stay fast' },
  { name: 'Aggregation $lookup', detail: 'member counts and effective permissions are computed in the cluster' },
  { name: 'Multi-document transactions', detail: 'every change commits atomically with its audit event' },
]

declare global {
  var __adhDirectoryReady: Map<string, Promise<void>> | undefined
}

export function describeMongoError(error: unknown): string {
  const e = error as { code?: number; codeName?: string; message?: string }
  const label = e.codeName ?? (e.code !== undefined ? `code ${e.code}` : 'error')
  return `${label}: ${(e.message ?? String(error)).slice(0, 240)}`
}

/**
 * Validators are defense-in-depth: `collMod` needs the dbAdmin privilege, which Atlas
 * readWrite database users lack. Skip validation rather than failing every directory request.
 */
async function applyValidator(db: Db, name: string, schema: Document) {
  const options = { validator: { $jsonSchema: schema }, validationLevel: 'moderate', validationAction: 'error' } as const
  try {
    const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0
    if (!exists) await db.createCollection(name, options)
    else await db.command({ collMod: name, ...options })
  } catch (error) {
    if ((error as { codeName?: string }).codeName === 'NamespaceExists') return
    console.warn(`[directory] $jsonSchema validator not applied to "${name}" (${describeMongoError(error)})`)
  }
}

/** Index conflicts (same keys, different name/options from an earlier deploy) should not block reads. */
async function ensureIndex(db: Db, collection: string, keys: Document, options: Document) {
  try {
    await db.collection(collection).createIndex(keys, options)
  } catch (error) {
    const code = (error as { code?: number }).code
    if (code === 85 || code === 86) {
      console.warn(`[directory] index ${options.name} on "${collection}" conflicts with an existing index; keeping the existing one`)
      return
    }
    if (code === 11000) {
      console.warn(`[directory] unique index ${options.name} not built: existing documents contain duplicates`)
      return
    }
    throw error
  }
}

async function prepare(db: Db, tenantId: string) {
  await Promise.all([applyValidator(db, USERS, USER_SCHEMA), applyValidator(db, ROLES_COLLECTION, ROLE_SCHEMA)])
  await Promise.all([
    ensureIndex(db, USERS, { tenantId: 1, email: 1 }, { name: 'tenant_email_unique', unique: true, collation: CASE_INSENSITIVE }),
    ensureIndex(db, USERS, { tenantId: 1, roles: 1 }, { name: 'tenant_roles' }),
    ensureIndex(
      db,
      ROLES_COLLECTION,
      { tenantId: 1, name: 1 },
      { name: 'tenant_role_name_unique', unique: true, collation: CASE_INSENSITIVE },
    ),
  ])
  const now = new Date().toISOString()
  await db.collection<StringIdDoc>(ROLES_COLLECTION).bulkWrite(
    ROLES.map((role) => {
      const { _id, createdAt, updatedAt: _u, ...definition } = builtInRoleDefinition(role, tenantId, now)
      return {
        updateOne: {
          filter: { _id: `${tenantId}:${_id}` },
          update: { $set: definition, $setOnInsert: { createdAt, updatedAt: createdAt } },
          upsert: true,
        },
      }
    }),
  )
}

/** Applies validators, indexes and built-in role documents once per server instance and tenant. */
export function ensureDirectory(db: Db, tenantId: string): Promise<void> {
  globalThis.__adhDirectoryReady ??= new Map()
  const cache = globalThis.__adhDirectoryReady
  let ready = cache.get(tenantId)
  if (!ready) {
    ready = prepare(db, tenantId).catch((error) => {
      cache.delete(tenantId)
      throw error
    })
    cache.set(tenantId, ready)
  }
  return ready
}

/** Built-in roles are stored as `<tenantId>:<Role>` so each tenant has its own copy; the app refers to them by name. */
export function storedRoleToDefinition(doc: Document): RoleDefinition {
  const id = String(doc._id)
  return {
    _id: doc.builtIn ? id.slice(id.indexOf(':') + 1) : id,
    tenantId: doc.tenantId,
    name: doc.name,
    description: doc.description ?? '',
    permissions: doc.permissions ?? [],
    accessLevel: doc.accessLevel,
    builtIn: !!doc.builtIn,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export interface RoleSummary extends RoleDefinition {
  memberCount: number
  activeMemberCount: number
}

/** One aggregation: roles joined to their members via the multikey `users.roles` index. */
export async function roleSummaries(db: Db, tenantId: string, session?: ClientSession): Promise<RoleSummary[]> {
  const rows = await db
    .collection(ROLES_COLLECTION)
    .aggregate(
      [
        { $match: { tenantId } },
        { $addFields: { roleKey: { $cond: ['$builtIn', '$name', { $toString: '$_id' }] } } },
        {
          $lookup: {
            from: USERS,
            let: { key: '$roleKey' },
            pipeline: [
              { $match: { tenantId, $expr: { $in: ['$$key', '$roles'] } } },
              { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'disabled'] }, 0, 1] } } } },
            ],
            as: 'members',
          },
        },
        {
          $addFields: {
            memberCount: { $ifNull: [{ $first: '$members.total' }, 0] },
            activeMemberCount: { $ifNull: [{ $first: '$members.active' }, 0] },
          },
        },
        { $project: { members: 0, roleKey: 0 } },
        { $sort: { builtIn: -1, name: 1 } },
      ],
      { session },
    )
    .toArray()
  return rows.map((row) => ({ ...storedRoleToDefinition(row), memberCount: row.memberCount, activeMemberCount: row.activeMemberCount }))
}

export async function customRoles(db: Db, tenantId: string, session?: ClientSession): Promise<RoleDefinition[]> {
  const docs = await db.collection(ROLES_COLLECTION).find({ tenantId, builtIn: false }, { session }).toArray()
  return docs.map(storedRoleToDefinition)
}

export async function loadUser(db: Db, tenantId: string, userId: string, session?: ClientSession): Promise<User | null> {
  return db.collection<User>(USERS).findOne({ _id: userId, tenantId }, { session })
}

export async function userHasPermission(db: Db, user: User, permission: Permission, session?: ClientSession) {
  if (user.status === 'disabled') return false
  return permissionsFor(user, await customRoles(db, user.tenantId, session)).has(permission)
}

/** Guards against locking every administrator out of the tenant. */
export async function activeAdminCount(db: Db, tenantId: string, session?: ClientSession): Promise<number> {
  return db.collection(USERS).countDocuments({ tenantId, status: { $ne: 'disabled' }, roles: { $in: ADMIN_ROLES } }, { session })
}

export function newDirectoryId(prefix: 'usr' | 'role') {
  return `${prefix}_${randomBytes(10).toString('hex')}`
}

export async function writeAudit(
  db: Db,
  session: ClientSession,
  event: {
    tenantId: string
    actorId: string
    action: string
    resourceType: 'user' | 'role'
    resourceId: string
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    result?: 'success' | 'denied'
  },
) {
  const eventId = `aud_${randomBytes(10).toString('hex')}`
  await db.collection<StringIdDoc>(AUDIT).insertOne(
    {
      _id: eventId,
      eventId,
      tenantId: event.tenantId,
      occurredAt: new Date().toISOString(),
      actorId: event.actorId,
      actorType: 'user',
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      result: event.result ?? 'success',
      correlationId: `corr_${randomBytes(10).toString('hex')}`,
      requestId: `req_${randomBytes(10).toString('hex')}`,
      before: event.before,
      after: event.after,
    },
    { session },
  )
}
