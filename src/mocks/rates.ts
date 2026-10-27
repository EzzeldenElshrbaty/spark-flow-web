import type { Api, Rate } from '@/api/types'
import type { MockDb } from './db'
import type { MockHub } from './realtime'
import { delay } from './latency'
import { badRequest, clone, notFound, requireCan } from './shared'

/** Hourly cost per person (EGP), read and changed by Admins only; project cost follows on the next read. */
export function ratesApi(db: MockDb, hub: MockHub): Api['rates'] {
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
          if (!data.users.some((u) => u.id === userId)) throw notFound('User', userId)
          if (!Number.isFinite(hourlyCost) || hourlyCost < 0) throw badRequest('Hourly cost is 0 or more.')
          const rate: Rate = { userId, hourlyCost, currency: 'EGP' }
          const i = data.rates.findIndex((r) => r.userId === userId)
          if (i >= 0) data.rates[i] = rate
          else data.rates.push(rate)
          return rate
        }),
      )
      hub.publish({ type: 'ratesChanged' })
      return saved
    },
  }
}
