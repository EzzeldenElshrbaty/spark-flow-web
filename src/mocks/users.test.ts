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
    for (const call of [() => api.db.export(), () => api.db.reset(), () => api.db.reset()])
      await expect(call()).rejects.toMatchObject({ name: 'ApiError', status: 403, detail: "You don't have access to the database." })
  })
})

describe('the acting person belongs to each db (tab)', () => {
  it('two dbs on one store with their own actors act as their own person', async () => {
    const store = createMemoryStore()
    const a = createMockApi(createDb(store, seed), hub)
    const b = createMockApi(createDb(store, seed), hub)
    await a.users.viewAs('u-3')
    expect((await a.users.me()).id).toBe('u-3')
    expect((await b.users.me()).id).toBe('u-1')
    const fromA = await a.chat.send('c-general', 'from tab A')
    const fromB = await b.chat.send('c-general', 'from tab B')
    expect(fromA.senderId).toBe('u-3')
    expect(fromB.senderId).toBe('u-1')
  })

  it('the stored default person never changes', async () => {
    const store = createMemoryStore()
    const db = createDb(store, seed)
    await createMockApi(db, hub).users.viewAs('u-5')
    await createMockApi(db, hub).chat.send('c-general', 'hello')
    expect(await store.readDoc()).toMatchObject({ currentUserId: 'u-1' })
  })

  it('an actor naming a user who no longer exists falls back to the default', async () => {
    const store = createMemoryStore()
    const db = createDb(store, seed, undefined, { get: () => 'u-gone', set: () => {}, clear: () => {} })
    expect((await createMockApi(db, hub).users.me()).id).toBe('u-1')
  })
})
