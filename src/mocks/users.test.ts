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
  hub = createMockHub(`test-users-${Math.random()}`, null)
  api = createMockApi(createDb(createMemoryStore(), seed), hub)
})
afterEach(() => hub.close())

describe('users', () => {
  it('viewAs switches currentUserId and me() follows', async () => {
    expect((await api.users.me()).id).toBe('u-1')
    const other = await api.users.viewAs('u-5')
    expect(other.id).toBe('u-5')
    expect((await api.users.me()).id).toBe('u-5')
  })

  it('viewAs unknown user → 404', async () => {
    await expect(api.users.viewAs('u-nope')).rejects.toMatchObject({ name: 'ApiError', status: 404 })
    expect((await api.users.me()).id).toBe('u-1')
  })

  it('only an admin may export, reload or reset the database', async () => {
    expect((await api.db.export()).app).toBe('spark-flow') // u-1 is the admin
    await api.users.viewAs('u-5') // a member
    for (const call of [() => api.db.export(), () => api.db.reloadSeed(), () => api.db.reset()])
      await expect(call()).rejects.toMatchObject({ name: 'ApiError', status: 403, detail: "You don't have access to the database." })
  })
})
