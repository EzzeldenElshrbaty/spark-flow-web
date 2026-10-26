import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { createDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let api: Api
let hub: MockHub

beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-rates-${Math.random()}`, null)
  api = createMockApi(createDb(createMemoryStore(), seed), hub)
})
afterEach(() => hub.close())

describe('rates', () => {
  it('only admins read or change rates', async () => {
    expect(await api.rates.list()).toHaveLength(9)
    expect(await api.rates.update('u-3', 320)).toMatchObject({ userId: 'u-3', hourlyCost: 320, currency: 'EGP' })
    await expect(api.rates.update('u-3', -1)).rejects.toMatchObject({ status: 400, detail: 'Hourly cost is 0 or more.' })
    await expect(api.rates.update('u-nope', 100)).rejects.toMatchObject({ status: 404 })
    await api.users.viewAs('u-2') // PM
    await expect(api.rates.list()).rejects.toMatchObject({ status: 403, detail: "You don't have access to hourly costs." })
    await expect(api.rates.update('u-3', 1)).rejects.toMatchObject({ status: 403 })
  })

  it('a new rate changes project cost', async () => {
    const cost = async () => (await api.projects.list('ws-eng')).find((p) => p.key === 'NEX')!.cost!
    const before = await cost()
    await api.rates.update('u-3', 1000)
    expect(await cost()).toBeGreaterThan(before)
  })
})
