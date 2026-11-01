import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { parseBody } from '@/lib/messageBody'
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
  hub = createMockHub(`test-scheduled-${++n}`, null)
  api = createMockApi(db, hub, () => now)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString()
const body = parseBody('Standup notes are in the doc.')
const create = (over: Partial<Parameters<Api['scheduled']['create']>[0]> = {}) =>
  api.scheduled.create({ channelId: 'c-general', rootId: null, body, sendAt: inHours(24), tz: 'Africa/Cairo', ...over })

describe('scheduled.create (spec 6.8 Schedule menu, §7 ScheduledMessage)', () => {
  it('keeps it to send later as me, with its text worked out from the body', async () => {
    const item = await create()
    expect(item).toMatchObject({ userId: 'u-1', workspaceId: 'ws-eng', channelId: 'c-general', rootId: null, content: 'Standup notes are in the doc.', sendAt: inHours(24), tz: 'Africa/Cairo', status: 'scheduled', sentId: null, failure: null })
    expect(await api.scheduled.list('ws-eng')).toEqual([item])
    expect(events).toContainEqual({ type: 'scheduledChanged', userId: 'u-1' })
  })

  it('checks what a send checks, now: the time, the text, and who may post', async () => {
    await expect(create({ sendAt: inHours(-1) })).rejects.toMatchObject({ status: 400, detail: 'Pick a time in the future.' })
    await expect(create({ body: [] })).rejects.toMatchObject({ status: 400 })
    await db.update((d) => {
      d.channels.find((c) => c.id === 'c-general')!.archivedAt = now.toISOString()
    })
    await expect(create()).rejects.toMatchObject({ status: 400, detail: 'This channel is archived.' })
  })

  it('a thread reply needs its root in that channel', async () => {
    const root = (await db.read()).messages.find((m) => m.channelId === 'c-dm-1')!
    expect(await create({ channelId: 'c-dm-1', rootId: root.id })).toMatchObject({ rootId: root.id })
    await expect(create({ channelId: 'c-general', rootId: root.id })).rejects.toMatchObject({ status: 404 })
  })
})

describe('scheduled.list, update, remove, sendNow', () => {
  it('lists mine in this workspace, soonest first; sent ones drop out, failed ones stay', async () => {
    const later = await create({ sendAt: inHours(48) })
    const soon = await create({ sendAt: inHours(1) })
    expect((await api.scheduled.list('ws-eng')).map((s) => s.id)).toEqual([soon.id, later.id])
    db.actAs('u-2')
    expect(await api.scheduled.list('ws-eng')).toEqual([])
    db.actAs('u-1')
    now = new Date(now.getTime() + 2 * 3_600_000)
    await runScheduler(db, hub, now)
    expect((await api.scheduled.list('ws-eng')).map((s) => s.id)).toEqual([later.id])
    await db.update((d) => {
      d.channels.find((c) => c.id === 'c-general')!.archivedAt = now.toISOString()
    })
    now = new Date(now.getTime() + 48 * 3_600_000)
    await runScheduler(db, hub, now)
    expect(await api.scheduled.list('ws-eng')).toMatchObject([{ id: later.id, status: 'failed', failure: 'This channel is archived.' }])
  })

  it('reschedules (back to scheduled if it failed) and edits the text', async () => {
    const item = await create()
    const edited = await api.scheduled.update(item.id, { sendAt: inHours(3), body: parseBody('New *plan*') })
    expect(edited).toMatchObject({ sendAt: inHours(3), content: 'New plan', status: 'scheduled' })
    await expect(api.scheduled.update(item.id, { sendAt: inHours(-1) })).rejects.toMatchObject({ status: 400 })
    await db.update((d) => {
      Object.assign(d.scheduled[0], { status: 'failed', failure: 'This channel is archived.' })
    })
    expect(await api.scheduled.update(item.id, { sendAt: inHours(5) })).toMatchObject({ status: 'scheduled', failure: null })
  })

  it('Send now sends it at once as a message; Delete throws it away; only mine', async () => {
    const item = await create()
    const message = await api.scheduled.sendNow(item.id)
    expect(message).toMatchObject({ channelId: 'c-general', senderId: 'u-1', content: 'Standup notes are in the doc.' })
    expect(await api.scheduled.list('ws-eng')).toEqual([])
    expect(events).toContainEqual(expect.objectContaining({ type: 'messageReceived' }))
    await expect(api.scheduled.sendNow(item.id)).rejects.toMatchObject({ status: 400, detail: 'That message was already sent.' })

    const other = await create()
    db.actAs('u-2')
    await expect(api.scheduled.remove(other.id)).rejects.toMatchObject({ status: 404 })
    db.actAs('u-1')
    await api.scheduled.remove(other.id)
    expect(await api.scheduled.list('ws-eng')).toEqual([])
  })

  it('Send now that is refused says why and keeps it', async () => {
    const item = await create()
    await db.update((d) => {
      d.channels.find((c) => c.id === 'c-general')!.archivedAt = now.toISOString()
    })
    await expect(api.scheduled.sendNow(item.id)).rejects.toMatchObject({ status: 400, detail: 'This channel is archived.' })
    expect(await api.scheduled.list('ws-eng')).toMatchObject([{ id: item.id, status: 'scheduled' }])
  })

  it('the scheduler tells my other tabs when one goes out', async () => {
    await create({ sendAt: inHours(1) })
    events = []
    now = new Date(now.getTime() + 3_600_000)
    await runScheduler(db, hub, now)
    expect(events).toContainEqual({ type: 'scheduledChanged', userId: 'u-1' })
  })
})

describe('chat.sent (spec 6.12 Drafts & sent: Sent)', () => {
  it('my messages and replies in this workspace, newest first, with where they went', async () => {
    const sent = await api.chat.sent('ws-eng')
    const data = await db.read()
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every((s) => (s.target.kind === 'message' ? data.messages : data.replies).find((r) => r.id === s.target.id)?.senderId === 'u-1')).toBe(true)
    expect(sent.map((s) => s.createdAt)).toEqual(sent.map((s) => s.createdAt).sort().reverse())
    const reply = sent.find((s) => s.target.kind === 'reply')
    if (reply) expect(reply.rootId).not.toBeNull()
    expect(sent.some((s) => s.text === '')).toBe(false)
  })
})
