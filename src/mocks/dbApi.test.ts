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
  hub = createMockHub(`test-dbapi-${Math.random()}`, null)
  api = createMockApi(createDb(createMemoryStore(), seed), hub)
})
afterEach(() => hub.close())

describe('database actions reach other tabs', () => {
  it('reset and reload publish dataReset; a refused one publishes nothing', async () => {
    const events: string[] = []
    hub.subscribe((e) => events.push(e.type))
    await api.db.reset()
    await api.db.reloadSeed()
    expect(events).toEqual(['dataReset', 'dataReset'])
    await api.users.viewAs('u-2')
    await expect(api.db.reset()).rejects.toMatchObject({ status: 403 })
    expect(events).toEqual(['dataReset', 'dataReset'])
  })
})
