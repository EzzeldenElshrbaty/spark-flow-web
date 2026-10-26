import type { Api } from '@/api/types'
import { can } from '@/lib/permissions'
import type { MockDb } from './db'
import { delay } from './latency'
import { currentUser, forbidden } from './shared'

/** The Database page's actions: admins only. They publish nothing: the UI clears its own cache. */
export function dbApi(db: MockDb): Api['db'] {
  const allowed = async () => {
    const me = currentUser(await db.read())
    if (!can('database.manage', { userId: me.id, role: me.role })) throw forbidden('the database')
  }
  return {
    async export() {
      await delay()
      await allowed()
      return db.exportAll()
    },
    async reloadSeed() {
      await delay()
      await allowed()
      await db.reset()
    },
    async reset() {
      await delay()
      await allowed()
      await db.reset()
    },
  }
}
