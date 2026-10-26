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
  hub = createMockHub(`test-time-${Math.random()}`, null)
  api = createMockApi(createDb(createMemoryStore(), seed), hub)
})
afterEach(() => hub.close())

describe('time.list', () => {
  it("returns the project's entries newest first, with rates for admins only", async () => {
    const asAdmin = await api.time.list('p-nex')
    expect(asAdmin.entries.length).toBeGreaterThan(0)
    expect(asAdmin.entries.every((e) => e.projectId === 'p-nex')).toBe(true)
    const starts = asAdmin.entries.map((e) => e.startedAt)
    expect(starts).toEqual([...starts].sort().reverse())
    expect(asAdmin.rates?.length).toBeGreaterThan(0)

    await api.users.viewAs('u-3')
    const asMember = await api.time.list('p-nex')
    expect(asMember.entries).toHaveLength(asAdmin.entries.length)
    expect(asMember.rates).toBeNull()
  })

  it('404s for an unknown project', async () => {
    await expect(api.time.list('p-nope')).rejects.toMatchObject({ status: 404 })
  })
})
