import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let hub: MockHub
let api: Api
let events: RealtimeEvent[]
let n = 0

beforeEach(() => {
  latency.min = latency.max = 0
  db = createDb(createMemoryStore(), seed)
  hub = createMockHub(`test-pins-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

describe('pins (spec 6.5 Pin to channel, §7 Pin)', () => {
  it('pins a message: the message says who pinned it, the channel lists it, and a system line says so', async () => {
    await api.pins.pin('m-b07')
    const [pinned] = await api.pins.list('c-backend')
    expect(pinned).toMatchObject({ message: { id: 'm-b07' }, pinnedBy: 'u-1' })
    const page = await api.chat.messages('c-backend')
    expect(page.items.find((m) => m.id === 'm-b07')?.pin).toMatchObject({ by: 'u-1' })
    expect(page.items[0]?.system).toEqual({ kind: 'pinned', messageId: 'm-b07' })
    expect(events).toContainEqual({ type: 'channelChanged', channelId: 'c-backend' })
    expect(events).toContainEqual({ type: 'messageChanged', channelId: 'c-backend', messageId: 'm-b07' })
  })

  it('pinning twice keeps one pin; unpin takes it off without a line', async () => {
    await api.pins.pin('m-b07')
    await api.pins.pin('m-b07')
    expect(await api.pins.list('c-backend')).toHaveLength(1)
    const lines = (await api.chat.messages('c-backend')).items.length
    await api.pins.unpin('m-b07')
    expect(await api.pins.list('c-backend')).toEqual([])
    expect((await api.chat.messages('c-backend')).items).toHaveLength(lines)
    expect((await api.chat.messages('c-backend')).items.find((m) => m.id === 'm-b07')?.pin ?? null).toBeNull()
  })

  it('lists newest pin first', async () => {
    const ids = (await api.chat.messages('c-backend')).items.filter((m) => !m.system).slice(0, 2).map((m) => m.id)
    await api.pins.pin(ids[0])
    await api.pins.pin(ids[1])
    expect((await api.pins.list('c-backend')).map((p) => p.message.id)).toEqual([ids[1], ids[0]])
  })

  it('refuses where I may not post, a system line, and a deleted message; a deleted message loses its pin', async () => {
    await api.users.viewAs('u-3')
    await expect(api.pins.list('c-release')).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-1')
    const system = (await api.chat.messages('c-backend')).items.find((m) => m.system)
    if (system) await expect(api.pins.pin(system.id)).rejects.toMatchObject({ status: 400 })
    await api.pins.pin('m-b07')
    await api.chat.remove({ kind: 'message', id: 'm-b07' })
    expect(await api.pins.list('c-backend')).toEqual([])
    await expect(api.pins.pin('m-b07')).rejects.toMatchObject({ status: 400, detail: 'This message was deleted.' })
  })
})
