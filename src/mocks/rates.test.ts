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

describe('rates reach other tabs', () => {
  it('a change publishes ratesChanged; a refused one publishes nothing', async () => {
    const events: string[] = []
    hub.subscribe((e) => events.push(e.type))
    await api.rates.update('u-3', 500)
    expect(events).toEqual(['ratesChanged'])
    await api.users.viewAs('u-2')
    await expect(api.rates.update('u-3', 1)).rejects.toMatchObject({ status: 403 })
    expect(events).toEqual(['ratesChanged'])
  })
})

describe('rate history', () => {
  it('a new rate changes cost only from today on', async () => {
    const report = async () => (await api.time.report('ws-eng', 30)).byPerson.find((p) => p.userId === 'u-3')!
    const before = await report()
    await api.rates.update('u-3', 1000)
    const after = await report()
    expect(after.cost).toBeCloseTo(before.cost, 0) // every seeded entry is from an earlier day (the rolling window moves a few ms)
    expect(after.rate).toBe(1000)
  })
  it('two changes on one day keep one row', async () => {
    await api.rates.update('u-3', 500)
    await api.rates.update('u-3', 510)
    const mine = (await api.rates.list()).filter((r) => r.userId === 'u-3')
    expect(mine.map((r) => r.hourlyCost)).toEqual([300, 510])
  })
})

