import type { User } from '@/api/types'
import { ApiError } from '@/lib/apiError'

export type Thing = 'Workspace' | 'User' | 'Channel' | 'Message' | 'Project' | 'Ticket' | 'File'

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

/** The current user, as the mock backend sees them. */
export function currentUser(data: { currentUserId: string; users: User[] }): User {
  const me = data.users.find((u) => u.id === data.currentUserId)
  if (!me) throw notFound('User', data.currentUserId)
  return me
}
