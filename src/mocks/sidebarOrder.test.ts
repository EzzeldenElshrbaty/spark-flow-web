import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let api: Api
let hub: MockHub
beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-sidebar-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())

describe('sidebar order (spec 5.1: drag to reorder Starred and Channels)', () => {
  it('nobody has one at first', async () => {
    expect(await api.sidebar.order('ws-eng')).toEqual({ starred: [], channels: [] })
  })

  it('keeps my order per section and workspace, says so live, and is mine alone', async () => {
    const events: string[] = []
    const off = hub.subscribe((e) => events.push(e.type))
    await api.sidebar.setOrder('ws-eng', 'channels', ['c-general', 'c-backend'])
    off()
    expect(events).toContain('sidebarChanged')
    expect(await api.sidebar.order('ws-eng')).toEqual({ starred: [], channels: ['c-general', 'c-backend'] })
    expect(await api.sidebar.order('ws-design')).toEqual({ starred: [], channels: [] })
    await api.sidebar.setOrder('ws-eng', 'channels', ['c-backend'])
    expect((await api.sidebar.order('ws-eng')).channels).toEqual(['c-backend'])
    db.actAs('u-2')
    expect((await api.sidebar.order('ws-eng')).channels).toEqual([])
  })

  it('keeps each id once and drops ones I can’t list there (another workspace, unknown, someone else’s private)', async () => {
    await db.update((d) => {
      d.channels.push({ ...d.channels.find((c) => c.id === 'c-backend')!, id: 'c-secret', name: 'secret', isPrivate: true, memberIds: ['u-2'] })
    })
    await api.sidebar.setOrder('ws-eng', 'channels', ['c-backend', 'c-backend', 'nope', 'c-secret', 'c-dm-3', 'c-general'])
    expect((await api.sidebar.order('ws-eng')).channels).toEqual(['c-backend', 'c-general'])
  })

  it('starring, unstarring or leaving takes the channel out of my order, so it comes back at the end (slice Y review)', async () => {
    await api.sidebar.setOrder('ws-eng', 'channels', ['c-general', 'c-backend', 'c-frontend'])
    await api.sidebar.setOrder('ws-eng', 'starred', ['c-backend'])
    await api.chat.setStarred('c-general', true)
    expect(await api.sidebar.order('ws-eng')).toEqual({ starred: ['c-backend'], channels: ['c-backend', 'c-frontend'] })
    await api.chat.setStarred('c-backend', false)
    // Unstarred, it leaves both lists: it comes back at the end of Channels.
    expect(await api.sidebar.order('ws-eng')).toEqual({ starred: [], channels: ['c-frontend'] })
    const events: string[] = []
    const off = hub.subscribe((e) => events.push(e.type))
    await api.chat.leave('c-frontend')
    off()
    expect((await api.sidebar.order('ws-eng')).channels).toEqual([])
    expect(events).toContain('sidebarChanged')
  })

  it('an empty list throws the order away (Sort A–Z); a bad section or a huge list is refused', async () => {
    await api.sidebar.setOrder('ws-eng', 'starred', ['c-backend'])
    await api.sidebar.setOrder('ws-eng', 'starred', [])
    expect((await api.sidebar.order('ws-eng')).starred).toEqual([])
    await expect(api.sidebar.setOrder('ws-eng', 'dms' as 'starred', [])).rejects.toMatchObject({ status: 400 })
    await expect(api.sidebar.setOrder('ws-eng', 'channels', Array.from({ length: 501 }, (_, i) => `c${i}`))).rejects.toMatchObject({ status: 400 })
    await expect(api.sidebar.setOrder('ws-nope', 'channels', [])).rejects.toMatchObject({ status: 404 })
  })
})
