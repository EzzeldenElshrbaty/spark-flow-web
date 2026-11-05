import type { Api, NewPerson, PersonPatch, PersonRow, User } from '@/api/types'
import { isEmail, normalEmail } from '@/lib/invites'
import { can } from '@/lib/permissions'
import { audit, changesBetween, recordOf } from './audit'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { grantsFor, keepsAnAdmin } from './roles'
import { closeCheckIn, stopRunning } from './time'
import { badRequest, clone, currentUser, forbidden, newId, notFound, pickPatch, text } from './shared'

const MAX_NAME = 80
const MAX_TITLE = 80
const MAX_REASON = 200
/** What an edit may change, and what the audit log records of it. */
const PERSON_FIELDS = ['name', 'email', 'title', 'roleIds', 'teamIds'] as const satisfies readonly (keyof NewPerson)[]

/** Whoever may change settings, users and roles (slice 3); anyone else gets 403. */
function requireManage(data: DbData) {
  const me = currentUser(data)
  if (!can('settings.manage', { userId: me.id, grants: grantsFor(data, me) })) throw forbidden('users')
  return me
}

/** A person's values, tidied and checked: the first rule broken, as the form shows it. */
function checkPerson(data: DbData, values: NewPerson, exceptId?: string): NewPerson {
  const name = text(values.name, 'Name').trim()
  if (!name) throw badRequest('Give their name.')
  if (name.length > MAX_NAME) throw badRequest(`A name has at most ${MAX_NAME} characters.`)
  const email = normalEmail(text(values.email, 'Email'))
  if (!isEmail(email)) throw badRequest('That isn’t an email address.')
  const clash = data.users.find((u) => u.id !== exceptId && u.email.toLowerCase() === email)
  if (clash) throw badRequest(`${clash.name} has that email already.`)
  const title = text(values.title ?? '', 'Title').trim()
  if (title.length > MAX_TITLE) throw badRequest(`A title has at most ${MAX_TITLE} characters.`)
  const ids = (value: unknown) => (Array.isArray(value) && value.every((v) => typeof v === 'string') ? [...new Set(value as string[])] : null)
  const roleIds = ids(values.roleIds)
  if (!roleIds || roleIds.length === 0) throw badRequest('Give them at least one role.')
  if (!roleIds.every((id) => data.roles.some((r) => r.id === id))) throw badRequest("That role doesn't exist.")
  const teamIds = ids(values.teamIds)
  if (!teamIds || !teamIds.every((id) => data.teams.some((t) => t.id === id))) throw badRequest("That team doesn't exist.")
  // In the roles' and teams' own order, so the same choice always reads the same.
  return { name, email, title, roleIds: data.roles.filter((r) => roleIds.includes(r.id)).map((r) => r.id), teamIds: data.teams.filter((t) => teamIds.includes(t.id)).map((t) => t.id) }
}

/** Puts a person on exactly these teams, on both sides: their `teamIds` and each team's `memberIds`. */
function setTeams(data: DbData, person: User, teamIds: string[]) {
  person.teamIds = teamIds
  for (const team of data.teams) {
    const on = teamIds.includes(team.id)
    if (on && !team.memberIds.includes(person.id)) team.memberIds.push(person.id)
    if (!on) team.memberIds = team.memberIds.filter((id) => id !== person.id)
  }
}

/**
 * When someone last did anything the server saw: wrote, started time or checked in, or anything the log names them
 * for. Ends aren't counted: a timer or check-in the server closes (the 12-hour limit, deactivating) isn't their doing.
 */
function lastActive(data: DbData): Map<string, string> {
  const last = new Map<string, string>()
  const saw = (userId: string | null | undefined, at: string | null | undefined) => {
    if (userId && at && at > (last.get(userId) ?? '')) last.set(userId, at)
  }
  for (const m of data.messages) if (!m.system) saw(m.senderId, m.createdAt)
  for (const r of data.replies) saw(r.senderId, r.createdAt)
  for (const c of data.comments) saw(c.authorId, c.createdAt)
  for (const e of data.timeEntries) saw(e.userId, e.startedAt)
  for (const c of data.checkIns) saw(c.userId, c.checkedInAt)
  for (const e of data.audit) saw(e.actorId, e.at)
  return last
}

/** People (slice 3): everyone reads the list; Settings → Users adds, edits, deactivates and reactivates them. */
export function usersApi(db: MockDb, hub: MockHub, now: () => Date = () => new Date()): Api['users'] {
  const changed = () => hub.publish({ type: 'peopleChanged' })
  const find = (data: DbData, id: string) => {
    const person = data.users.find((u) => u.id === id)
    if (!person) throw notFound('User', id)
    return person
  }
  return {
    async me() {
      await delay()
      const data = await db.read()
      const me = currentUser(data)
      // What my roles let me do, worked out here so the client never decides it.
      return { ...me, grants: grantsFor(data, me) }
    },
    async list(workspaceId) {
      await delay()
      const data = await db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      // Users don't belong to a single workspace in the mock; everyone is in every workspace. Deactivated people stay,
      // marked, so their names still show on what they did; pickers leave them out.
      return data.users
    },
    async viewAs(userId) {
      await delay()
      const user = (await db.read()).users.find((u) => u.id === userId)
      if (!user) throw notFound('User', userId)
      if (user.deactivated) throw badRequest(`${user.name} is deactivated.`)
      // This tab only: other tabs keep acting as their own person.
      db.actAs(user.id)
      // The prototype's sign-in (spec §10 has none yet), recorded as the person now acting.
      await db.update((data) => {
        audit(data, { action: 'signedIn', group: 'access', record: recordOf.user(user), detail: 'Demo user switcher (prototype only)' })
      })
      return user
    },
    async directory() {
      await delay()
      const data = await db.read()
      requireManage(data)
      const last = lastActive(data)
      return clone(data.users.map((u): PersonRow => ({ ...u, lastActiveAt: last.get(u.id) ?? null })))
    },
    async create(input) {
      await delay()
      const person = await db.update((data) => {
        requireManage(data)
        const values = checkPerson(data, input)
        const person: User = { id: newId('u'), name: values.name, email: values.email, title: values.title, roleIds: values.roleIds, teamIds: [], presence: 'offline' }
        data.users.push(person)
        setTeams(data, person, values.teamIds)
        audit(data, { action: 'created', group: 'settings', record: recordOf.user(person), changes: changesBetween(data, {}, person, PERSON_FIELDS) })
        return clone(person)
      })
      changed()
      return person
    },
    async update(id, patch: PersonPatch) {
      await delay()
      const result = await db.update((data) => {
        requireManage(data)
        const person = find(data, id)
        const values = checkPerson(data, { ...person, ...pickPatch(patch, PERSON_FIELDS) } as NewPerson, id)
        const before = clone(person)
        Object.assign(person, { name: values.name, email: values.email, title: values.title, roleIds: values.roleIds })
        setTeams(data, person, values.teamIds)
        keepsAnAdmin(data)
        const changes = changesBetween(data, before, person, PERSON_FIELDS)
        if (changes.length) audit(data, { action: 'changed', group: 'settings', record: recordOf.user(person), changes })
        return { person: clone(person), same: changes.length === 0 }
      })
      if (!result.same) changed()
      return result.person
    },
    async deactivate(id, reason) {
      await delay()
      const result = await db.update((data) => {
        const me = requireManage(data)
        const person = find(data, id)
        if (person.id === me.id) throw badRequest("You can't deactivate yourself.")
        const why = text(reason ?? '', 'Reason').trim()
        if (why.length > MAX_REASON) throw badRequest(`Keep the reason under ${MAX_REASON} characters.`)
        // Already off (a double click, two tabs): nothing changes, nothing is logged or sent.
        if (person.deactivated) return { person: clone(person), stopped: [] as string[], same: true }
        const at = now()
        person.deactivated = { at: at.toISOString(), by: me.id, reason: why || null }
        // Their clock stops where it stopped counting; an open check-in closes as a forgotten one does (today's now,
        // an earlier day's at that day's last entry). They show offline, and @here no longer reaches them.
        const stopped = stopRunning(data, id, at.toISOString(), 'flow')
        for (const c of data.checkIns.filter((c) => c.userId === id && c.checkedOutAt === null)) closeCheckIn(data, c, at)
        person.presence = 'offline'
        keepsAnAdmin(data)
        audit(data, { action: 'deactivated', group: 'settings', record: recordOf.user(person), changes: [{ field: 'Status', from: 'Active', to: 'Deactivated' }], detail: why || null })
        return { person: clone(person), stopped: stopped ? [stopped.projectId] : [], same: false }
      })
      if (result.same) return result.person
      for (const projectId of result.stopped) hub.publish({ type: 'timeLogged', userId: id, projectId })
      changed()
      return result.person
    },
    async reactivate(id) {
      await delay()
      const result = await db.update((data) => {
        requireManage(data)
        const person = find(data, id)
        if (!person.deactivated) return { person: clone(person), same: true }
        person.deactivated = null
        audit(data, { action: 'reactivated', group: 'settings', record: recordOf.user(person), changes: [{ field: 'Status', from: 'Deactivated', to: 'Active' }] })
        return { person: clone(person), same: false }
      })
      if (!result.same) changed()
      return result.person
    },
  }
}
