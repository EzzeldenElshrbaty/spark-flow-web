import type { Api } from '@/api/types'
import type { MockDb } from './db'
import { delay } from './latency'
import { notFound } from './shared'

export function usersApi(db: MockDb): Api['users'] {
  return {
    async me() {
      await delay()
      const data = db.read()
      const me = data.users.find((u) => u.id === data.currentUserId)
      if (!me) throw notFound('User', data.currentUserId) // unreachable with the seed; keeps the type honest
      return me
    },
    async list(workspaceId) {
      await delay()
      const data = db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      // Users don't belong to a single workspace in the mock; everyone is in every workspace.
      return data.users
    },
  }
}
