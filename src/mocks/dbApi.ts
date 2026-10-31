import type { Api } from '@/api/types'
import { can } from '@/lib/permissions'
import type { MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { currentUser, forbidden } from './shared'
import { grantsFor } from './roles'
import { actorFor, audit, type AuditInput } from './audit'

const ALL_DATA = { type: 'data', id: 'all', name: 'All demo data' }

/** The Database page's actions: admins only. A reset or reload tells every other tab its data is out of date. */
export function dbApi(db: MockDb, hub: MockHub): Api['db'] {
  const allowed = async () => {
    const data = await db.read()
    const me = currentUser(data)
    if (!can('database.manage', { userId: me.id, grants: grantsFor(data, me) })) throw forbidden('the database')
  }
  /** Recorded once it's done: the export was read in full, so the entry goes on what's there now. */
  const record = (input: AuditInput) =>
    db.update((data) => {
      audit(data, input)
    })
  /**
   * The log as it is, and who is acting, before a reset or an import replaces the data. The log isn't demo data:
   * nothing removes an entry, so it goes back in, the file's or the seed's own left out, with the replace's entry.
   */
  const keepLog = async () => {
    const data = await db.read()
    return { events: data.audit, actor: actorFor(data, currentUser(data)) }
  }
  const putBack = (kept: Awaited<ReturnType<typeof keepLog>>, input: AuditInput) =>
    db.update((data) => {
      data.audit = kept.events
      audit(data, { ...input, actor: kept.actor })
    })
  return {
    async export() {
      await delay()
      await allowed()
      const bundle = await db.exportAll()
      await record({ action: 'exported', group: 'exports', record: ALL_DATA })
      return bundle
    },
    /** Replaces everything with an export (this or an older version); a file that isn't one writes nothing. */
    async import(bundle) {
      await delay()
      await allowed()
      const kept = await keepLog()
      await db.importAll(bundle)
      // Every tab reloads whatever happens to the entry: the data was replaced either way.
      try {
        await putBack(kept, { action: 'imported', group: 'settings', record: ALL_DATA, detail: 'Everything but the audit log replaced from a file' })
      } finally {
        hub.publish({ type: 'dataReset' })
      }
    },
    async reset() {
      await delay()
      await allowed()
      const kept = await keepLog()
      await db.reset()
      try {
        await putBack(kept, { action: 'reset', group: 'settings', record: ALL_DATA, detail: 'Everything but the audit log back to the seed' })
      } finally {
        hub.publish({ type: 'dataReset' })
      }
    },
  }
}
