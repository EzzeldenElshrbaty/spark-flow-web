import type { Api, DemoPerson } from '@/api/types'
import { DEMO_PASSWORD } from '@/lib/demo'
import { isActive } from '@/lib/people'
import { actorFor, audit, recordOf } from './audit'
import type { MockDb } from './db'
import { delay } from './latency'
import { grantsFor } from './roles'
import { badRequest, clone } from './shared'

// Signing in (slice AB). In the prototype everyone has the one demo password; the session is the browser's (MockDb).

/** The built-in roles' order on the demo list; roles of one's own come after, A–Z. */
const ROLE_ORDER = ['admin', 'pm', 'sales', 'member']
const rank = (roleIds: string[]) => Math.min(...roleIds.map((id) => (ROLE_ORDER.includes(id) ? ROLE_ORDER.indexOf(id) : ROLE_ORDER.length)), ROLE_ORDER.length)

const NO_MATCH = "That email and password don’t match."

export function authApi(db: MockDb): Api['auth'] {
  return {
    async signIn(email, password) {
      await delay()
      const typed = String(email ?? '').trim().toLowerCase()
      if (!typed || !password) throw badRequest('Enter your email and password.')
      const data = await db.read()
      const user = data.users.find((u) => u.email.toLowerCase() === typed)
      if (!user || password !== DEMO_PASSWORD) {
        await db.update((d) => {
          audit(d, { action: 'signInFailed', group: 'access', record: null, result: 'failed', detail: 'Wrong email or password', actor: { id: null, name: typed, roles: '' } })
        })
        throw badRequest(NO_MATCH)
      }
      if (!isActive(user)) {
        await db.update((d) => {
          audit(d, { action: 'signInFailed', group: 'access', record: recordOf.user(user), result: 'refused', detail: 'Deactivated', actor: actorFor(d, user) })
        })
        // A 400, not a 403: a refused sign-in is logged here, not again as "denied".
        throw badRequest('This account is deactivated. Ask an Admin to reactivate it.')
      }
      db.signIn(user.id)
      const after = await db.update((d) => {
        audit(d, { action: 'signedIn', group: 'access', record: recordOf.user(user), detail: 'Password' })
        return d
      })
      return clone({ ...user, grants: grantsFor(after, user) })
    },
    async signOut() {
      await delay()
      if (db.signedIn()) {
        await db.update((data) => {
          const me = data.users.find((u) => u.id === data.currentUserId)
          if (me) audit(data, { action: 'signedOut', group: 'access', record: recordOf.user(me) })
        })
      }
      db.signOut()
    },
    async demoPeople() {
      await delay()
      const data = await db.read()
      const names = (ids: string[]) => [...ids].sort((a, b) => rank([a]) - rank([b])).flatMap((id) => data.roles.find((r) => r.id === id)?.name ?? [])
      return data.users
        .filter(isActive)
        .sort((a, b) => rank(a.roleIds) - rank(b.roleIds) || a.name.localeCompare(b.name))
        .map((u): DemoPerson => ({ id: u.id, name: u.name, email: u.email, title: u.title, roles: names(u.roleIds) }))
    },
  }
}
