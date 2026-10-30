import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { FLOWBOT_ID } from '@/lib/flowbot'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { runScheduler } from './scheduler'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let hub: MockHub
let api: Api
let events: RealtimeEvent[]
let n = 0
let now = new Date('2030-01-01T09:00:00.000Z')

beforeEach(() => {
  latency.min = latency.max = 0
  now = new Date('2030-01-01T09:00:00.000Z')
  db = createDb(createMemoryStore(), seed)
  hub = createMockHub(`test-saved-${++n}`, null)
  api = createMockApi(db, hub, () => now)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const inMinutes = (m: number) => new Date(now.getTime() + m * 60_000).toISOString()
const message = { kind: 'message', id: 'm-e01' } as const

describe('saved.save (spec 6.4 Save for later, §7 SavedItem)', () => {
  it('saves a message in progress, with what the Saved view shows', async () => {
    const item = await api.saved.save(message)
    expect(item).toMatchObject({
      userId: 'u-1', workspaceId: 'ws-eng', target: message, status: 'inProgress', remindAt: null, firedAt: null,
      channelId: 'c-dm-1', authorId: 'u-2', authorName: 'Nour El-Sayed', gone: null, rootId: null,
    })
    expect(item.text).toContain('Can we pair on the refresh token tests')
    expect(await api.saved.list('ws-eng')).toEqual([item])
    expect(events).toContainEqual({ type: 'savedChanged', userId: 'u-1' })
  })

  it('saves a thread reply, which opens in its thread', async () => {
    const reply = (await db.read()).replies.find((r) => r.channelId === 'c-general')!
    const item = await api.saved.save({ kind: 'reply', id: reply.id })
    expect(item).toMatchObject({ channelId: 'c-general', rootId: reply.messageId })
  })

  it('keeps one item per message: saving again brings it back to In progress', async () => {
    const first = await api.saved.save(message)
    await api.saved.update(first.id, { status: 'completed' })
    const again = await api.saved.save(message)
    expect(again.id).toBe(first.id)
    expect(again.status).toBe('inProgress')
    expect(await api.saved.list('ws-eng')).toHaveLength(1)
  })

  it('Remind me sets the time on the same item, in the future only', async () => {
    const saved = await api.saved.save(message)
    const reminded = await api.saved.save(message, inMinutes(20))
    expect(reminded).toMatchObject({ id: saved.id, remindAt: inMinutes(20), firedAt: null })
    await expect(api.saved.save(message, inMinutes(-1))).rejects.toMatchObject({ status: 400, detail: 'Pick a time in the future.' })
  })

  it('refuses a message I can’t read (404) or that was deleted', async () => {
    db.actAs('u-5')
    await expect(api.saved.save(message)).rejects.toMatchObject({ status: 404 })
    db.actAs('u-1')
    await db.update((d) => {
      d.messages.find((m) => m.id === 'm-e01')!.deletedAt = now.toISOString()
    })
    await expect(api.saved.save(message)).rejects.toMatchObject({ status: 400, detail: 'This message was deleted.' })
  })
})

describe('saved.update and saved.remove', () => {
  it('completing or archiving cancels the reminder; a new time brings it back to In progress', async () => {
    const item = await api.saved.save(message, inMinutes(60))
    expect(await api.saved.update(item.id, { status: 'completed' })).toMatchObject({ status: 'completed', remindAt: null })
    expect(await api.saved.update(item.id, { remindAt: inMinutes(30) })).toMatchObject({ status: 'inProgress', remindAt: inMinutes(30), firedAt: null })
    expect(await api.saved.update(item.id, { status: 'archived' })).toMatchObject({ status: 'archived', remindAt: null })
    expect(await api.saved.update(item.id, { status: 'inProgress' })).toMatchObject({ status: 'inProgress', remindAt: null })
    expect(await api.saved.update(item.id, { remindAt: inMinutes(10) })).toMatchObject({ remindAt: inMinutes(10) })
    expect(await api.saved.update(item.id, { remindAt: null })).toMatchObject({ remindAt: null })
  })

  it('removes it from Saved', async () => {
    const item = await api.saved.save(message)
    await api.saved.remove(item.id)
    expect(await api.saved.list('ws-eng')).toEqual([])
  })

  it('only my own items: someone else’s is not found', async () => {
    const item = await api.saved.save(message)
    db.actAs('u-2')
    await expect(api.saved.update(item.id, { status: 'completed' })).rejects.toMatchObject({ status: 404 })
    await expect(api.saved.remove(item.id)).rejects.toMatchObject({ status: 404 })
    expect(await api.saved.list('ws-eng')).toEqual([])
  })
})

describe('saved.list', () => {
  it('this workspace’s items; reminders first (soonest), then the newest saved', async () => {
    const plain = await api.saved.save({ kind: 'message', id: 'm-e02' })
    now = new Date(now.getTime() + 1000)
    const later = await api.saved.save(message, inMinutes(120))
    const general = (await db.read()).messages.find((m) => m.channelId === 'c-general' && !m.system)!
    const soon = await api.saved.save({ kind: 'message', id: general.id }, inMinutes(5))
    expect((await api.saved.list('ws-eng')).map((i) => i.id)).toEqual([soon.id, later.id, plain.id])
    expect(await api.saved.list('ws-design')).toEqual([])
  })

  it('says when a saved message was deleted or is out of reach, without its text', async () => {
    const item = await api.saved.save(message)
    await db.update((d) => {
      d.messages.find((m) => m.id === 'm-e01')!.deletedAt = now.toISOString()
    })
    expect((await api.saved.list('ws-eng'))[0]).toMatchObject({ id: item.id, gone: 'deleted', text: '' })
    await db.update((d) => {
      d.messages.find((m) => m.id === 'm-e01')!.deletedAt = null
      d.channels.find((c) => c.id === 'c-dm-1')!.memberIds = ['u-2', 'u-3']
    })
    expect((await api.saved.list('ws-eng'))[0]).toMatchObject({ gone: 'hidden', text: '', authorName: null })
  })
})

describe('a saved item’s reminder firing (spec 6.5: Flowbot DM; 6.12: Activity Reminders)', () => {
  it('fires once: Flowbot’s DM card, an Activity item, and the item stays In progress', async () => {
    const item = await api.saved.save(message, inMinutes(20))
    now = new Date(now.getTime() + 20 * 60_000)
    expect(await runScheduler(db, hub, now)).toBe(1)
    const data = await db.read()
    const dm = data.channels.find((c) => c.memberIds.includes(FLOWBOT_ID))!
    const card = data.messages.find((m) => m.channelId === dm.id)!
    expect(card.flowbot).toEqual({ kind: 'reminder', savedId: item.id, channelId: 'c-dm-1', rootId: null, target: message })
    expect(data.saved[0]).toMatchObject({ status: 'inProgress', firedAt: now.toISOString() })
    const activity = await api.inbox.list('ws-eng')
    expect(activity[0]).toMatchObject({ kind: 'reminder', actorId: FLOWBOT_ID, actorName: 'Flowbot', channelId: 'c-dm-1', messageId: 'm-e01', read: false })
    expect(events).toContainEqual({ type: 'savedChanged', userId: 'u-1' })
    expect(events).toContainEqual({ type: 'notificationCreated', userId: 'u-1' })
    expect(await runScheduler(db, hub, now)).toBe(0)
  })

  it('a completed item doesn’t fire; snoozing fires it again later', async () => {
    const item = await api.saved.save(message, inMinutes(1))
    await api.saved.update(item.id, { status: 'completed' })
    now = new Date(now.getTime() + 60_000)
    expect(await runScheduler(db, hub, now)).toBe(0)

    await api.saved.update(item.id, { remindAt: inMinutes(1) })
    now = new Date(now.getTime() + 60_000)
    expect(await runScheduler(db, hub, now)).toBe(1)
    await api.saved.update(item.id, { remindAt: inMinutes(20) })
    now = new Date(now.getTime() + 20 * 60_000)
    expect(await runScheduler(db, hub, now)).toBe(1)
  })
})
