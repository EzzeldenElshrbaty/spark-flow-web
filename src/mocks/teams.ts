import type { Api } from '@/api/types'
import type { MockDb } from './db'
import { delay } from './latency'
import { notFound } from './shared'

export function teamsApi(db: MockDb): Api['teams'] {
  return {
    async list(workspaceId) {
      await delay()
      const data = await db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      return data.teams.filter((t) => t.workspaceId === workspaceId)
    },
  }
}
