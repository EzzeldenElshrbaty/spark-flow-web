import type { Api } from '@/api/types'
import { can } from '@/lib/permissions'
import type { MockDb } from './db'
import { delay } from './latency'
import { findProject } from './projects'
import { clone, currentUser } from './shared'

export function timeApi(db: MockDb): Api['time'] {
  return {
    async list(projectId) {
      await delay()
      const data = await db.read()
      findProject(data, projectId)
      const me = currentUser(data)
      const entries = data.timeEntries.filter((e) => e.projectId === projectId).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      const rates = can('timeCost.view', { userId: me.id, role: me.role }) ? data.rates : null
      return clone({ entries, rates })
    },
  }
}
