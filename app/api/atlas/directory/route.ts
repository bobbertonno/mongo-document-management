import { NextResponse, type NextRequest } from 'next/server'
import type { ClientSession, Db, Document } from 'mongodb'
import { COLLECTIONS, getDb, isAtlasConfigured } from '@/lib/atlas/client'
import {
  ATLAS_FEATURES,
  activeAdminCount,
  customRoles,
  describeMongoError,
  ensureDirectory,
  loadUser,
  newDirectoryId,
  roleSummaries,
  userHasPermission,
  writeAudit,
} from '@/lib/atlas/directory'
import { isBuiltInRole, roleInputSchema, userInputSchema } from '@/lib/domain/access'
import type { User } from '@/lib/domain/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const USERS = COLLECTIONS.users.name
const ROLES = COLLECTIONS.roles.name

class DirectoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const fail = (message: string, status: number) => NextResponse.json({ error: message }, { status })

async function context(request: NextRequest, tenantId: unknown) {
  if (!isAtlasConfigured()) throw new DirectoryError('MongoDB Atlas is not configured', 503)
  if (typeof tenantId !== 'string' || !tenantId) throw new DirectoryError('tenantId is required', 400)
  const db = await getDb()
  await ensureDirectory(db, tenantId)
  return { db, tenantId }
}

function handle(error: unknown) {
  if (error instanceof DirectoryError) return fail(error.message, error.status)
  const code = (error as { code?: number }).code
  if (code === 11000) return fail('That email or role name is already in use', 409)
  if (code === 121) return fail('Atlas rejected the document: it does not match the collection schema', 400)
  console.error('[directory] request failed', error)
  return fail(`Directory request failed (${describeMongoError(error)})`, 502)
}

export async function GET(request: NextRequest) {
  try {
    const { db, tenantId } = await context(request, request.nextUrl.searchParams.get('tenantId'))
    return NextResponse.json({ roles: await roleSummaries(db, tenantId), features: ATLAS_FEATURES })
  } catch (error) {
    return handle(error)
  }
}

async function assertAssignableRoles(db: Db, tenantId: string, actor: User, roles: string[], session: ClientSession) {
  const custom = new Set((await customRoles(db, tenantId, session)).map((r) => r._id))
  for (const id of roles) {
    if (!isBuiltInRole(id) && !custom.has(id)) throw new DirectoryError(`Unknown role: ${id}`, 400)
    if (id === 'PlatformAdmin' && !actor.roles.includes('PlatformAdmin')) {
      throw new DirectoryError('Only a PlatformAdmin can grant PlatformAdmin', 403)
    }
  }
}

async function assertAdminRemains(db: Db, tenantId: string, session: ClientSession) {
  if ((await activeAdminCount(db, tenantId, session)) < 1) {
    throw new DirectoryError('At least one active TenantAdmin or PlatformAdmin must remain', 409)
  }
}

type Action =
  | { action: 'createUser'; input: unknown }
  | { action: 'updateUser'; id: string; input: unknown }
  | { action: 'createRole'; input: unknown }
  | { action: 'updateRole'; id: string; input: unknown }
  | { action: 'deleteRole'; id: string }

function parseOrThrow<T>(result: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }): T {
  if (!result.success) throw new DirectoryError(result.error.issues[0]?.message ?? 'Invalid input', 400)
  return result.data
}

async function run(db: Db, tenantId: string, actor: User, body: Action, session: ClientSession) {
  const now = new Date().toISOString()
  const users = db.collection<User>(USERS)
  const roles = db.collection<Document>(ROLES)
  const audit = (action: string, resourceType: 'user' | 'role', resourceId: string, before?: object, after?: object) =>
    writeAudit(db, session, {
      tenantId,
      actorId: actor._id,
      action,
      resourceType,
      resourceId,
      before: before as Record<string, unknown>,
      after: after as Record<string, unknown>,
    })

  switch (body.action) {
    case 'createUser': {
      const input = parseOrThrow(userInputSchema.safeParse(body.input))
      await assertAssignableRoles(db, tenantId, actor, input.roles, session)
      const user: User = { _id: newDirectoryId('usr'), tenantId, ...input, createdAt: now, updatedAt: now }
      await users.insertOne(user, { session })
      await audit('user.created', 'user', user._id, undefined, { email: user.email, roles: user.roles, status: user.status })
      return { id: user._id }
    }
    case 'updateUser': {
      const input = parseOrThrow(userInputSchema.safeParse(body.input))
      const before = await users.findOne({ _id: body.id, tenantId }, { session })
      if (!before) throw new DirectoryError('User not found', 404)
      await assertAssignableRoles(db, tenantId, actor, input.roles, session)
      await users.updateOne({ _id: body.id, tenantId }, { $set: { ...input, updatedAt: now } }, { session })
      await assertAdminRemains(db, tenantId, session)
      await audit(
        'user.updated',
        'user',
        body.id,
        { email: before.email, roles: before.roles, status: before.status ?? 'active', department: before.department ?? null },
        { email: input.email, roles: input.roles, status: input.status, department: input.department },
      )
      return { id: body.id }
    }
    case 'createRole': {
      const input = parseOrThrow(roleInputSchema.safeParse(body.input))
      if (isBuiltInRole(input.name)) throw new DirectoryError('That name is reserved for a built-in role', 409)
      const id = newDirectoryId('role')
      await roles.insertOne({ _id: id as never, tenantId, ...input, builtIn: false, createdAt: now, updatedAt: now }, { session })
      await audit('role.created', 'role', id, undefined, { ...input })
      return { id }
    }
    case 'updateRole': {
      const input = parseOrThrow(roleInputSchema.safeParse(body.input))
      if (isBuiltInRole(input.name)) throw new DirectoryError('That name is reserved for a built-in role', 409)
      const before = await roles.findOne({ _id: body.id as never, tenantId, builtIn: false }, { session })
      if (!before) throw new DirectoryError('Custom role not found. Built-in roles cannot be edited.', 404)
      await roles.updateOne({ _id: body.id as never }, { $set: { ...input, updatedAt: now } }, { session })
      await audit(
        'role.updated',
        'role',
        body.id,
        { name: before.name, permissions: before.permissions, accessLevel: before.accessLevel },
        { ...input },
      )
      return { id: body.id }
    }
    case 'deleteRole': {
      const before = await roles.findOne({ _id: body.id as never, tenantId, builtIn: false }, { session })
      if (!before) throw new DirectoryError('Custom role not found. Built-in roles cannot be deleted.', 404)
      // Pipeline update: drop the role and fall back to Viewer so the `roles` minItems validator always holds.
      const reassigned = await users.updateMany(
        { tenantId, roles: body.id },
        [
          { $set: { roles: { $filter: { input: '$roles', cond: { $ne: ['$$this', body.id] } } }, updatedAt: now } },
          { $set: { roles: { $cond: [{ $eq: [{ $size: '$roles' }, 0] }, ['Viewer'], '$roles'] } } },
        ],
        { session },
      )
      await roles.deleteOne({ _id: body.id as never }, { session })
      await audit('role.deleted', 'role', body.id, { name: before.name, permissions: before.permissions }, {
        membersUpdated: reassigned.modifiedCount,
      })
      return { id: body.id }
    }
    default:
      throw new DirectoryError('Unknown action', 400)
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as (Action & { tenantId?: unknown }) | null
  if (!body || typeof body.action !== 'string') return fail('Invalid request', 400)
  if ('id' in body && typeof body.id !== 'string') return fail('Invalid id', 400)
  try {
    const { db, tenantId } = await context(request, body.tenantId)
    const actorId = request.headers.get('x-actor-id')
    const actor = actorId ? await loadUser(db, tenantId, actorId) : null
    if (!actor) return fail('Unknown acting user', 401)
    if (!(await userHasPermission(db, actor, 'users.manage'))) {
      await db.client.withSession((session) =>
        writeAudit(db, session, {
          tenantId,
          actorId: actor._id,
          action: `directory.${body.action}`,
          resourceType: body.action.endsWith('Role') ? 'role' : 'user',
          resourceId: 'id' in body ? body.id : 'new',
          result: 'denied',
        }),
      )
      return fail(`${actor.name} does not have the "Manage users & roles" permission`, 403)
    }

    const session = db.client.startSession()
    try {
      let result: { id: string } | undefined
      await session.withTransaction(async () => {
        result = await run(db, tenantId, actor, body, session)
      })
      return NextResponse.json({ ok: true, ...result })
    } finally {
      await session.endSession()
    }
  } catch (error) {
    return handle(error)
  }
}
