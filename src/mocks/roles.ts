import type { Api, Role, RoleChange, User } from '@/api/types'
import { ALL_PERMISSIONS, BUILT_IN_ROLES, can, grantsOf, PERMISSION_GROUPS, type Permission } from '@/lib/permissions'
import { audit, recordOf } from './audit'
import type { DbData, MockDb, StoredRole } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { badRequest, clone, currentUser, forbidden, newId, notFound } from './shared'

const MAX_NAME = 40

/** The four roles as the seed and the v24 migration store them: today's rights, built in. */
export const builtInRoles = (): StoredRole[] => BUILT_IN_ROLES.map((role) => ({ id: role.id, name: role.name, builtIn: true, grants: [...role.grants] }))

/** Every permission a person's roles give them (slice 1). */
export const grantsFor = (data: Pick<DbData, 'roles'>, user: Pick<User, 'roleIds'>): Permission[] => grantsOf(user.roleIds, data.roles)

/** Who is acting, as `can()` reads them: their id, permissions and teams. */
const actorOf = (data: Pick<DbData, 'roles'>, user: User) => ({ userId: user.id, grants: grantsFor(data, user), userTeamIds: user.teamIds })

/** A role as read: with how many people hold it. */
const withHolders = (data: DbData, role: StoredRole): Role => ({ ...clone(role), holders: data.users.filter((u) => u.roleIds.includes(role.id)).length })

function checkName(data: DbData, value: unknown, exceptId?: string): string {
  if (typeof value !== 'string' || !value.trim()) throw badRequest('Name the role.')
  const name = value.trim()
  if (name.length > MAX_NAME) throw badRequest(`A role’s name has at most ${MAX_NAME} characters.`)
  if (data.roles.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase())) throw badRequest(`There’s a role called ${name} already.`)
  return name
}

const LABEL = new Map<string, string>(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.id, p.label] as const)))

/** Each permission a role gained or lost, as the audit log shows it: "Create projects: Off → On". */
function grantChanges(before: readonly Permission[], after: readonly Permission[]) {
  return ALL_PERMISSIONS.filter((p) => before.includes(p) !== after.includes(p)).map((p) => ({
    field: LABEL.get(p) ?? p,
    from: before.includes(p) ? 'On' : 'Off',
    to: after.includes(p) ? 'On' : 'Off',
  }))
}

function checkGrants(value: unknown): Permission[] {
  if (!Array.isArray(value) || value.some((p) => !ALL_PERMISSIONS.includes(p as Permission))) throw badRequest("Some of these permissions don’t exist.")
  return ALL_PERMISSIONS.filter((p) => value.includes(p))
}

/** The rule no change may break: someone active can still change settings, users and roles (slices 1 and 3). */
export function keepsAnAdmin(data: DbData) {
  if (!data.users.some((u) => !u.deactivated && grantsFor(data, u).includes('settings.manage')))
    throw badRequest('At least one person must be able to change settings, users and roles.')
}

/** Roles and what each may do (slice 1). Reading is open to everyone; changing needs settings.manage. */
export function rolesApi(db: MockDb, hub: MockHub): Api['roles'] {
  const requireManage = (data: DbData) => {
    if (!can('settings.manage', actorOf(data, currentUser(data)))) throw forbidden('roles and permissions')
  }
  const changed = () => hub.publish({ type: 'rolesChanged' })
  return {
    async list() {
      await delay()
      const data = await db.read()
      return data.roles.map((role) => withHolders(data, role))
    },
    async create({ name, copyFrom }) {
      await delay()
      const role = await db.update((data) => {
        requireManage(data)
        const source = copyFrom ? data.roles.find((r) => r.id === copyFrom) : null
        if (copyFrom && !source) throw notFound('Role', copyFrom)
        const stored: StoredRole = { id: newId('role'), name: checkName(data, name), builtIn: false, grants: source ? [...source.grants] : [] }
        data.roles.push(stored)
        audit(data, { action: 'created', group: 'settings', record: recordOf.role(stored), changes: grantChanges([], stored.grants), detail: source ? `Copied from ${source.name}` : 'With no permissions' })
        return withHolders(data, stored)
      })
      changed()
      return role
    },
    async rename(id, name) {
      await delay()
      const role = await db.update((data) => {
        requireManage(data)
        const stored = data.roles.find((r) => r.id === id)
        if (!stored) throw notFound('Role', id)
        const was = stored.name
        stored.name = checkName(data, name, id)
        if (stored.name !== was) audit(data, { action: 'changed', group: 'settings', record: recordOf.role(stored), changes: [{ field: 'Name', from: was, to: stored.name }] })
        return withHolders(data, stored)
      })
      changed()
      return role
    },
    async remove(id) {
      await delay()
      await db.update((data) => {
        requireManage(data)
        const stored = data.roles.find((r) => r.id === id)
        if (!stored) throw notFound('Role', id)
        if (stored.builtIn) throw badRequest(`${stored.name} is built in, so it can’t be deleted.`)
        const holders = data.users.filter((u) => u.roleIds.includes(id)).length
        if (holders) throw badRequest(`${holders === 1 ? '1 person holds' : `${holders} people hold`} ${stored.name}. Give them another role first.`)
        audit(data, { action: 'deleted', group: 'settings', record: recordOf.role(stored), changes: grantChanges(stored.grants, []) })
        data.roles = data.roles.filter((r) => r.id !== id)
      })
      changed()
    },
    async saveGrants(changes: RoleChange[]) {
      await delay()
      if (!Array.isArray(changes)) throw badRequest("Some of these permissions don’t exist.")
      // Nothing to change: still only for those who may, but nobody needs telling.
      if (changes.length === 0) {
        const data = await db.read()
        requireManage(data)
        return data.roles.map((role) => withHolders(data, role))
      }
      const roles = await db.update((data) => {
        requireManage(data)
        // Everything is checked before anything is kept.
        const next = changes.map((change) => {
          const stored = data.roles.find((r) => r.id === change?.roleId)
          if (!stored) throw notFound('Role', String(change?.roleId))
          const add = checkGrants(change.add)
          const remove = checkGrants(change.remove)
          // Applied to the role as it is now: someone else's change to other permissions stays.
          return { stored, grants: ALL_PERMISSIONS.filter((p) => !remove.includes(p) && (add.includes(p) || stored.grants.includes(p))) }
        })
        for (const { stored, grants } of next) {
          const changes = grantChanges(stored.grants, grants)
          if (changes.length) audit(data, { action: 'changed', group: 'settings', record: recordOf.role(stored), changes })
          stored.grants = grants
        }
        keepsAnAdmin(data)
        return data.roles.map((role) => withHolders(data, role))
      })
      changed()
      return roles
    },
  }
}
