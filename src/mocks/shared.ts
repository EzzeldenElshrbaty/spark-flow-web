import type { User } from '@/api/types'
import { can, grantsOf, type Action, type Permission, type ProjectRef, type ProjectScoped } from '@/lib/permissions'
import { ApiError } from '@/lib/apiError'
import { plainText } from '@/lib/mentions'

export type Thing = 'Workspace' | 'User' | 'Channel' | 'Message' | 'Reply' | 'Comment' | 'Time entry' | 'Project' | 'Ticket' | 'File' | 'Phase' | 'Deliverable' | 'Invitation' | 'Saved item' | 'Scheduled message' | 'Bookmark' | 'Role' | 'Audit entry'

/** The 404 the mock throws for an unknown id or key. */
export function notFound(thing: Thing, id: string): ApiError {
  return new ApiError({ title: 'Not found', status: 404, detail: `${thing} ${id} doesn't exist.` })
}

/** A deep copy, so what a caller gets (or a listener hears) is never shared with stored state. */
export function clone<T>(value: T): T {
  return structuredClone(value)
}

/** Now as an ISO time, pushed past `after` when needed so times within one channel or ticket always rise. */
export function stamp(after?: string | null): string {
  const now = Date.now()
  const floor = after ? new Date(after).getTime() + 1 : 0
  return new Date(Math.max(now, floor)).toISOString()
}

/** A new id such as m-3f2a…, in the style of the seed's ids. */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

/** The 403 the mock throws when the current user's role doesn't allow an action (spec §4.3). */
export function forbidden(thing: string): ApiError {
  return new ApiError({ title: 'Forbidden', status: 403, detail: `You don't have access to ${thing}.` })
}

/**
 * The current user, as the mock backend sees them. A deactivated person (slice 3) is signed out: a tab still acting
 * as them gets 401 on everything that asks who is acting.
 */
export function currentUser(data: { currentUserId: string; users: User[] }): User {
  const me = data.users.find((u) => u.id === data.currentUserId)
  if (!me) throw notFound('User', data.currentUserId)
  if (me.deactivated) throw new ApiError({ title: 'Signed out', status: 401, detail: 'This account was deactivated.' })
  return me
}

/**
 * Refuses people who are deactivated (slice 3) where someone is being added: an assignee, a project's people, a
 * channel's or a conversation's. People who already were there stay.
 */
export function requireActive(data: { users: User[] }, ids: Iterable<string | null | undefined>): void {
  for (const id of ids) {
    const person = id ? data.users.find((u) => u.id === id) : undefined
    if (person?.deactivated) throw badRequest(`${person.name} is deactivated.`)
  }
}

/** The 400 the mock throws for input it can't accept, with the sentence the form shows. */
export function badRequest(detail: string): ApiError {
  return new ApiError({ title: 'Bad request', status: 400, detail })
}

/**
 * The fields of a patch that a write takes, with `undefined` ones dropped. A field outside `allowed` is refused, not
 * dropped: it is a client mistake, and the backend copies this rule.
 */
export function pickPatch<K extends string>(patch: object, allowed: readonly K[]): Partial<Record<K, unknown>> {
  const entries = Object.entries(patch)
  if (entries.some(([key]) => !(allowed as readonly string[]).includes(key))) throw badRequest("Some of these fields can't be changed.")
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as Partial<Record<K, unknown>>
}

/** A text field's value, trimmed; anything that isn't text is a 400 naming the field ("Title must be text."). */
export function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw badRequest(`${field} must be text.`)
  return value.trim()
}

/** Whether a value is an ISO date the mock can read. */
export const isDate = (value: unknown): boolean => typeof value === 'string' && !Number.isNaN(Date.parse(value))

/** Throws 403 unless the current user may do `action` (on `project` when it is about one). */
export function requireCan(
  data: { currentUserId: string; users: User[]; projects: (ProjectRef & { managerId: string })[]; roles: { id: string; grants: readonly Permission[] }[] },
  action: Action,
  project?: ProjectRef,
  extra: { taskAssigneeId?: string | null; managesAny?: boolean } = {},
): User {
  const me = currentUser(data)
  const ok = can(action as Exclude<Action, ProjectScoped>, {
    userId: me.id,
    grants: grantsOf(me.roleIds, data.roles),
    project,
    userTeamIds: me.teamIds,
    managesAny: data.projects.some((p) => p.managerId === me.id),
    ...extra,
  })
  if (!ok) throw forbidden(project || action.startsWith('project.') ? 'this project' : action === 'rates.view' ? 'hourly costs' : action === 'dashboard.view' ? 'the dashboard' : action === 'timeCost.view' ? 'time and cost' : 'this')
  return me
}

const EXCERPT = 120

/** The text people read in the bell and Activity: `@[Name](id)` shown as `@Name`, cut to 120 characters. */
export function excerptOf(text: string) {
  const plain = plainText(text).replace(/\s+/g, ' ').trim()
  return plain.length > EXCERPT ? `${plain.slice(0, EXCERPT - 1)}…` : plain
}
