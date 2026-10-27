import type { Api } from '@/api/types'
import { can } from '@/lib/permissions'
import type { MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { currentUser, forbidden } from './shared'

/** The Database page's actions: admins only. A reset or reload tells every other tab its data is out of date. */
export function dbApi(db: MockDb, hub: MockHub): Api['db'] {
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
    /** Replaces everything with an export (this or an older version); a file that isn't one writes nothing. */
    async import(bundle) {
      await delay()
      await allowed()
      await db.importAll(bundle)
      hub.publish({ type: 'dataReset' })
    },
    async reset() {
      await delay()
      await allowed()
      await db.reset()
      hub.publish({ type: 'dataReset' })
    },
  }
}
