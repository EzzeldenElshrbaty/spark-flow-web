import type { Api, Rate } from '@/api/types'
import type { MockDb } from './db'
import type { MockHub } from './realtime'
import { delay } from './latency'
import { localDay } from '@/lib/dates'
import { badRequest, clone, newId, notFound, requireCan } from './shared'
import { audit } from './audit'

/** Hourly cost per person (EGP), read and changed by Admins only; project cost follows on the next read. */
export function ratesApi(db: MockDb, hub: MockHub, now: () => Date = () => new Date()): Api['rates'] {
  return {
    async list() {
      await delay()
      const data = await db.read()
      requireCan(data, 'rates.view')
      return clone(data.rates)
    },
    async update(userId, hourlyCost) {
      await delay()
      const saved = clone(
        await db.update((data) => {
          requireCan(data, 'rates.view')
          const person = data.users.find((u) => u.id === userId)
          if (!person) throw notFound('User', userId)
          if (!Number.isFinite(hourlyCost) || hourlyCost < 0) throw badRequest('Hourly cost is 0 or more.')
          // A new row from now on; past time keeps the rate it had. A second change the same day corrects that day's row.
          const at = now()
          const mine = data.rates.filter((r) => r.userId === userId).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
          const latest = mine.at(-1)
          if (latest?.hourlyCost !== hourlyCost) {
            audit(data, { action: 'changed', group: 'data', record: { type: 'rate', id: userId, name: person.name }, changes: [{ field: 'Hourly cost (EGP)', from: latest ? String(latest.hourlyCost) : null, to: String(hourlyCost) }] })
          }
          if (latest && localDay(new Date(latest.effectiveFrom)) === localDay(at) && latest.effectiveFrom !== '1970-01-01T00:00:00.000Z') {
            latest.hourlyCost = hourlyCost
            return latest
          }
          const rate: Rate = { id: newId('r'), userId, hourlyCost, currency: 'EGP', effectiveFrom: at.toISOString() }
          data.rates.push(rate)
          return rate
        }),
      )
      hub.publish({ type: 'ratesChanged' })
      return saved
    },
  }
}
