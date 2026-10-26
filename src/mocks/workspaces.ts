import type { Api } from '@/api/types'
import type { MockDb } from './db'
import { delay } from './latency'

export function workspacesApi(db: MockDb): Api['workspaces'] {
  return {
    async list() {
      await delay()
      return db.read().workspaces
    },
  }
}
