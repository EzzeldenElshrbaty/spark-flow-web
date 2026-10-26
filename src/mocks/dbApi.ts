import type { Api } from '@/api/types'
import { DB_VERSION, type MockDb } from './db'
import { delay } from './latency'

/** The Database page's actions. They publish nothing: the UI clears its own cache. */
export function dbApi(db: MockDb): Api['db'] {
  return {
    async export() {
      await delay()
      return { app: 'spark-flow', version: DB_VERSION, exportedAt: new Date().toISOString(), data: await db.read() }
    },
    async reloadSeed() {
      await delay()
      await db.reset()
    },
    async reset() {
      await delay()
      await db.reset()
    },
  }
}
