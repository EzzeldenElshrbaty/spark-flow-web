import type { Api } from '@/api/types'
import type { MockDb } from './db'
import { delay } from './latency'
import { grantsFor } from './roles'
import { notFound } from './shared'
import { audit, recordOf } from './audit'

export function usersApi(db: MockDb): Api['users'] {
  return {
    async me() {
      await delay()
      const data = await db.read()
      const me = data.users.find((u) => u.id === data.currentUserId)
      if (!me) throw notFound('User', data.currentUserId) // unreachable with the seed; keeps the type honest
      // What my roles let me do, worked out here so the client never decides it.
      return { ...me, grants: grantsFor(data, me) }
    },
    async list(workspaceId) {
      await delay()
      const data = await db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      // Users don't belong to a single workspace in the mock; everyone is in every workspace.
      return data.users
    },
    async viewAs(userId) {
      await delay()
      const user = (await db.read()).users.find((u) => u.id === userId)
      if (!user) throw notFound('User', userId)
      // This tab only: other tabs keep acting as their own person.
      db.actAs(user.id)
      // The prototype's sign-in (spec §10 has none yet), recorded as the person now acting.
      await db.update((data) => {
        audit(data, { action: 'signedIn', group: 'access', record: recordOf.user(user), detail: 'Demo user switcher (prototype only)' })
      })
      return user
    },
  }
}
