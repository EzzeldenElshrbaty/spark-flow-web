import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api } from '@/api/types'
import { FLOWBOT_ID } from '@/lib/flowbot'
import { parseBody } from '@/lib/messageBody'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { runScheduler, SCHEDULER_EVERY_MS, startScheduler } from './scheduler'
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
  hub = createMockHub(`test-scheduler-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => {
  hub.close()
  vi.useRealTimers()
})

const NOW = new Date('2030-01-01T09:00:00.000Z')
const before = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const after = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

/** u-1's Flowbot DM in a workspace, if there is one. */
const flowbotDm = async (userId = 'u-1', workspaceId = 'ws-eng') =>
  (await db.read()).channels.find((c) => c.workspaceId === workspaceId && c.kind === 'dm' && c.memberIds.includes(FLOWBOT_ID) && c.memberIds.includes(userId))
const messagesIn = async (channelId: string) => (await db.read()).messages.filter((m) => m.channelId === channelId)

async function remind(remindAt: string, messageId = 'm-e01', userId = 'u-1') {
  await db.update((d) => {
    d.saved.push({ id: `sav-${d.saved.length + 1}`, userId, workspaceId: 'ws-eng', target: { kind: 'message', id: messageId }, status: 'inProgress', remindAt, firedAt: null, savedAt: before(60_000) })
  })
}

async function schedule(sendAt: string, over: Partial<{ channelId: string; rootId: string | null; content: string; userId: string }> = {}) {
  const content = over.content ?? 'Standup notes are in the doc.'
  await db.update((d) => {
    d.scheduled.push({
      id: `sch-${d.scheduled.length + 1}`, userId: over.userId ?? 'u-1', workspaceId: 'ws-eng', channelId: over.channelId ?? 'c-general', rootId: over.rootId ?? null,
      content, body: parseBody(content), sendAt, tz: 'Africa/Cairo', status: 'scheduled', sentId: null, failure: null,
    })
  })
}

describe('runScheduler: reminders on saved items (spec §7, fired by a scheduler as a Flowbot DM)', () => {
  it('sends a due reminder to its owner from Flowbot, once', async () => {
    await remind(before(1000))
    expect(await runScheduler(db, hub, NOW)).toBe(1)
    const dm = await flowbotDm()
    expect(dm).toBeDefined()
    expect(dm!.memberIds.sort()).toEqual(['u-1', FLOWBOT_ID].sort())
    const [note] = await messagesIn(dm!.id)
    expect(note.senderId).toBe(FLOWBOT_ID)
    expect(note.content).toBe('Reminder: “Can we pair on the refresh token tests tomorrow at 11:00? I want to cover the 30-second grace window.” from Nour El-Sayed.')
    expect(note.flowbot).toEqual({ kind: 'reminder', savedId: 'sav-1', channelId: 'c-dm-1', target: { kind: 'message', id: 'm-e01' } })
    expect((await db.read()).saved[0].firedAt).toBe(NOW.toISOString())
    expect(events).toContainEqual(expect.objectContaining({ type: 'messageReceived', message: expect.objectContaining({ id: note.id }) }))
    expect(events).toContainEqual({ type: 'channelChanged', channelId: dm!.id })

    events = []
    expect(await runScheduler(db, hub, NOW)).toBe(0)
    expect(await messagesIn(dm!.id)).toHaveLength(1)
    expect(events).toEqual([])
  })

  it('keeps a reminder that is not due yet, and reuses the Flowbot DM for the next one', async () => {
    await remind(after(60_000))
    expect(await runScheduler(db, hub, NOW)).toBe(0)
    expect(await flowbotDm()).toBeUndefined()

    await remind(before(0), 'm-e02')
    await runScheduler(db, hub, NOW)
    await runScheduler(db, hub, new Date(NOW.getTime() + 60_000))
    const dms = (await db.read()).channels.filter((c) => c.memberIds.includes(FLOWBOT_ID))
    expect(dms).toHaveLength(1)
    expect(await messagesIn(dms[0].id)).toHaveLength(2)
  })

  it('says so when the message is gone, without quoting it', async () => {
    await remind(before(0))
    await db.update((d) => {
      d.messages.find((m) => m.id === 'm-e01')!.deletedAt = before(5000)
    })
    await runScheduler(db, hub, NOW)
    const [note] = await messagesIn((await flowbotDm())!.id)
    expect(note.content).toBe('Reminder about a message that was deleted.')
  })

  it('fires each reminder once when two runs overlap (two tabs)', async () => {
    await remind(before(0))
    const fired = await Promise.all([runScheduler(db, hub, NOW), runScheduler(db, hub, NOW)])
    expect(fired[0] + fired[1]).toBe(1)
    expect(await messagesIn((await flowbotDm())!.id)).toHaveLength(1)
  })
})

describe('runScheduler: scheduled messages (spec §7 ScheduledMessage)', () => {
  it('sends a due message as its author, once, and marks it sent', async () => {
    await schedule(before(0))
    expect(await runScheduler(db, hub, NOW)).toBe(1)
    const sent = (await messagesIn('c-general')).find((m) => m.content === 'Standup notes are in the doc.')
    expect(sent?.senderId).toBe('u-1')
    const stored = (await db.read()).scheduled[0]
    expect(stored).toMatchObject({ status: 'sent', sentId: sent!.id, failure: null })
    expect(events).toContainEqual(expect.objectContaining({ type: 'messageReceived', message: expect.objectContaining({ id: sent!.id }) }))
    expect(await runScheduler(db, hub, NOW)).toBe(0)
  })

  it('sends as its author even when this tab acts as someone else', async () => {
    db.actAs('u-2')
    await schedule(before(0))
    await runScheduler(db, hub, NOW)
    expect((await messagesIn('c-general')).find((m) => m.content === 'Standup notes are in the doc.')?.senderId).toBe('u-1')
  })

  it('sends a due reply into its thread', async () => {
    await schedule(before(0), { channelId: 'c-dm-1', rootId: 'm-e01', content: 'Moving it to 11:30.' })
    await runScheduler(db, hub, NOW)
    const reply = (await db.read()).replies.find((r) => r.content === 'Moving it to 11:30.')
    expect(reply).toMatchObject({ messageId: 'm-e01', senderId: 'u-1' })
    expect(events).toContainEqual(expect.objectContaining({ type: 'replyReceived' }))
  })

  it('marks it failed with the reason, and Flowbot tells its author, when it can no longer be posted', async () => {
    await schedule(before(0))
    await db.update((d) => {
      d.channels.find((c) => c.id === 'c-general')!.archivedAt = before(1000)
    })
    expect(await runScheduler(db, hub, NOW)).toBe(1)
    expect((await db.read()).scheduled[0]).toMatchObject({ status: 'failed', sentId: null, failure: 'This channel is archived.' })
    expect((await messagesIn('c-general')).some((m) => m.content === 'Standup notes are in the doc.')).toBe(false)
    const [note] = await messagesIn((await flowbotDm())!.id)
    expect(note.content).toBe('Your scheduled message to #general wasn’t sent. This channel is archived.')
    expect(note.flowbot).toEqual({ kind: 'scheduleFailed', scheduledId: 'sch-1' })
  })
})

describe('the Flowbot DM', () => {
  it('takes no messages: Flowbot only sends', async () => {
    await remind(before(0))
    await runScheduler(db, hub, NOW)
    const dm = await flowbotDm()
    await expect(api.chat.send(dm!.id, 'thanks')).rejects.toMatchObject({ status: 403, detail: 'Flowbot sends reminders here. It can’t read replies.' })
  })
})

describe('startScheduler', () => {
  it('runs at once, then every 15 seconds, until stopped', async () => {
    vi.useFakeTimers({ now: NOW })
    await remind(before(0))
    await remind(after(SCHEDULER_EVERY_MS - 1), 'm-e02')
    const stop = startScheduler(db, hub)
    await vi.waitFor(async () => expect((await db.read()).saved.filter((r) => r.firedAt)).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(SCHEDULER_EVERY_MS)
    await vi.waitFor(async () => expect((await db.read()).saved.filter((r) => r.firedAt)).toHaveLength(2))
    stop()
    await remind(after(SCHEDULER_EVERY_MS * 2), 'm-e01')
    await vi.advanceTimersByTimeAsync(SCHEDULER_EVERY_MS * 3)
    expect((await db.read()).saved.filter((r) => r.firedAt)).toHaveLength(2)
    expect(SCHEDULER_EVERY_MS).toBe(15_000)
  })
})
