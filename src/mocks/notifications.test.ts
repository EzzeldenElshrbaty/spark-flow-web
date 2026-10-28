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
  hub = createMockHub(`test-activity-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const mine = () => api.inbox.list('ws-eng')
const NOUR = '@[Nour El-Sayed](u-2)'
const YOUSSEF = '@[Youssef Abdelrahman](u-1)'

describe('Activity: reactions to my messages (spec 6.12)', () => {
  it('someone else’s reaction is an item for me; taking it back removes it', async () => {
    const m = await api.chat.send('c-general', 'Release is out')
    await api.users.viewAs('u-2')
    await api.chat.react({ kind: 'message', id: m.id }, '👍')
    await api.users.viewAs('u-1')
    expect(await mine()).toContainEqual(expect.objectContaining({ kind: 'reaction', emoji: '👍', actorId: 'u-2', actorName: 'Nour El-Sayed', channelId: 'c-general', messageId: m.id, excerpt: 'Release is out', read: false }))
    await api.users.viewAs('u-2')
    await api.chat.react({ kind: 'message', id: m.id }, '👍')
    await api.users.viewAs('u-1')
    expect((await mine()).filter((i) => i.kind === 'reaction' && i.messageId === m.id)).toEqual([])
  })

  it('on a reply of mine too, and never for my own reaction', async () => {
    const root = await api.chat.send('c-general', 'Question')
    const reply = await api.chat.reply(root.id, 'My answer')
    await api.chat.react({ kind: 'reply', id: reply.id }, '🎉')
    expect((await mine()).filter((i) => i.kind === 'reaction')).toEqual([])
    await api.users.viewAs('u-3')
    await api.chat.react({ kind: 'reply', id: reply.id }, '🎉')
    await api.users.viewAs('u-1')
    expect(await mine()).toContainEqual(expect.objectContaining({ kind: 'reaction', emoji: '🎉', actorId: 'u-3', messageId: root.id, replyId: reply.id, excerpt: 'My answer' }))
  })
})

describe('Activity: replies in threads I follow (spec 6.7, 6.12)', () => {
  it('a reply in my thread is an item for me, not for the one who replied', async () => {
    const root = await api.chat.send('c-general', 'Who owns the build?')
    await api.users.viewAs('u-2')
    const reply = await api.chat.reply(root.id, 'I do')
    expect((await mine()).filter((i) => i.kind === 'thread')).toEqual([])
    await api.users.viewAs('u-1')
    expect(await mine()).toContainEqual(expect.objectContaining({ kind: 'thread', actorId: 'u-2', channelId: 'c-general', messageId: root.id, replyId: reply.id, excerpt: 'I do', read: false }))
  })

  it('a follower the reply mentions gets the mention, once', async () => {
    const root = await api.chat.send('c-general', 'Who owns the build?')
    await api.users.viewAs('u-2')
    const reply = await api.chat.reply(root.id, `Asking ${YOUSSEF}`)
    await api.users.viewAs('u-1')
    expect((await mine()).filter((i) => i.replyId === reply.id || i.id === reply.id).map((i) => i.kind)).toEqual(['mention'])
  })

  it('nothing once I turned following off', async () => {
    const root = await api.chat.send('c-general', 'Who owns the build?')
    await api.chat.setFollowing(root.id, false)
    await api.users.viewAs('u-2')
    await api.chat.reply(root.id, 'I do')
    await api.users.viewAs('u-1')
    expect((await mine()).filter((i) => i.kind === 'thread')).toEqual([])
  })

  it('the text follows an edit, and a deleted reply’s item goes', async () => {
    const root = await api.chat.send('c-general', 'Who owns the build?')
    await api.users.viewAs('u-2')
    const reply = await api.chat.reply(root.id, 'I do')
    await api.chat.edit({ kind: 'reply', id: reply.id }, 'I do, from Monday')
    await api.users.viewAs('u-1')
    expect((await mine()).find((i) => i.replyId === reply.id)?.excerpt).toBe('I do, from Monday')
    await api.users.viewAs('u-2')
    await api.chat.remove({ kind: 'reply', id: reply.id })
    await api.users.viewAs('u-1')
    expect((await mine()).find((i) => i.replyId === reply.id)).toBeUndefined()
  })

  it('the person it’s for hears of it live', async () => {
    const root = await api.chat.send('c-general', 'Who owns the build?')
    await api.users.viewAs('u-2')
    events = []
    await api.chat.reply(root.id, 'I do')
    expect(events).toContainEqual({ type: 'notificationCreated', userId: 'u-1' })
  })

  it('a new message or reply that mentions someone tells them live, once each, and nobody else', async () => {
    const created = () => events.filter((e) => e.type === 'notificationCreated').map((e) => (e as { userId: string }).userId).sort()
    await api.users.viewAs('u-2')
    events = []
    await api.chat.send('c-general', `Ping ${YOUSSEF}`)
    expect(created()).toEqual(['u-1'])
    events = []
    await api.chat.send('c-general', 'Nobody named')
    expect(created()).toEqual([])
    const root = await api.chat.send('c-backend', 'Slow query on /search')
    await api.users.viewAs('u-1')
    await api.chat.reply(root.id, 'Looking')
    await api.users.viewAs('u-5')
    events = []
    // u-1 follows (replied) and is mentioned; u-2 wrote the root; u-6 is a member reached by @all.
    await api.chat.reply(root.id, '@all the index is missing')
    expect(created()).toEqual(['u-1', 'u-2', 'u-6'])
  })
})

describe('Activity: the feed (spec 6.12)', () => {
  it('mentions are there as in the bell, and share its read state both ways', async () => {
    await api.users.viewAs('u-2')
    const m = await api.chat.send('c-general', `Can you check, ${YOUSSEF}?`)
    await api.users.viewAs('u-1')
    expect(await mine()).toContainEqual(expect.objectContaining({ id: m.id, kind: 'mention', actorId: 'u-2', channelId: 'c-general', messageId: m.id, read: false }))
    await api.inbox.markRead('ws-eng', [m.id])
    expect((await api.mentions.mine()).find((i) => i.id === m.id)?.read).toBe(true)
  })

  it('newest first, this workspace only, and Mark all read (no ids) reads everything here', async () => {
    const first = await api.chat.send('c-general', 'One')
    const second = await api.chat.send('c-general', 'Two')
    await api.users.viewAs('u-2')
    await api.chat.react({ kind: 'message', id: first.id }, '👍')
    await api.chat.react({ kind: 'message', id: second.id }, '👍')
    await api.users.viewAs('u-1')
    const items = await mine()
    const reactions = items.filter((i) => i.kind === 'reaction')
    expect(reactions.map((i) => i.messageId)).toEqual([second.id, first.id])
    expect(items.every((i) => i.workspaceId === 'ws-eng')).toBe(true)
    await api.inbox.markRead('ws-eng')
    expect((await mine()).every((i) => i.read)).toBe(true)
  })

  it('marking ids read through one workspace leaves another workspace’s items as they were', async () => {
    const m = await api.chat.send('c-general', 'Release is out')
    await api.users.viewAs('u-2')
    await api.chat.react({ kind: 'message', id: m.id }, '👍')
    const mention = await api.chat.send('c-general', `Ping ${YOUSSEF}`)
    await api.users.viewAs('u-1')
    const reaction = (await mine()).find((i) => i.kind === 'reaction' && i.messageId === m.id)!
    await api.inbox.markRead('ws-design', [reaction.id, mention.id])
    expect((await mine()).filter((i) => i.id === reaction.id || i.id === mention.id).map((i) => i.read)).toEqual([false, false])
  })

  it('a channel set to Nothing stays out of Activity and the bell', async () => {
    await api.chat.setNotifyLevel('c-general', 'none')
    await api.users.viewAs('u-2')
    const m = await api.chat.send('c-general', `Can you check, ${YOUSSEF}?`)
    await api.users.viewAs('u-1')
    expect((await mine()).find((i) => i.id === m.id)).toBeUndefined()
    expect((await api.mentions.mine()).find((i) => i.id === m.id)).toBeUndefined()
  })
})

describe('notification level per channel (spec 6.11)', () => {
  it('a channel starts at Mentions, a DM at All; mine only, and saved', async () => {
    expect((await api.chat.channel('c-backend')).notifyLevel).toBe('mentions')
    expect((await api.chat.channel('c-dm-1')).notifyLevel).toBe('all')
    expect((await api.chat.setNotifyLevel('c-backend', 'all')).notifyLevel).toBe('all')
    await api.users.viewAs('u-2')
    expect((await api.chat.channel('c-backend')).notifyLevel).toBe('mentions')
  })

  it('refuses a level it doesn’t know', async () => {
    await expect(api.chat.setNotifyLevel('c-backend', 'loud' as never)).rejects.toMatchObject({ status: 400 })
  })
})

describe('Activity shows only what I can still read (review)', () => {
  it('after I leave a private channel its items go, its later text never shows, and a reaction there stores nothing', async () => {
    const root = await api.chat.send('c-release', 'Go/no-go?')
    await api.users.viewAs('u-2')
    const reply = await api.chat.reply(root.id, 'Leaning go')
    await api.users.viewAs('u-1')
    expect((await mine()).some((i) => i.replyId === reply.id)).toBe(true)
    await api.chat.leave('c-release')
    await api.users.viewAs('u-2')
    await api.chat.edit({ kind: 'reply', id: reply.id }, 'We slip to December, do not tell the client')
    await api.chat.react({ kind: 'message', id: root.id }, '👍')
    await api.users.viewAs('u-1')
    expect((await mine()).filter((i) => i.channelId === 'c-release')).toEqual([])
    expect((await db.read()).notifications.filter((n) => n.userId === 'u-1' && n.kind === 'reaction' && n.messageId === root.id)).toEqual([])
  })
})

describe('the mention window is cut after its filters (review)', () => {
  it('50 newer mentions in a channel at Nothing leave my other mentions in the bell and in Activity', async () => {
    await api.users.viewAs('u-2')
    const older = await api.chat.send('c-general', `Ping ${YOUSSEF}`)
    for (let i = 0; i < 50; i++) await api.chat.send('c-backend', `Noise ${i} ${YOUSSEF}`)
    await api.users.viewAs('u-1')
    await api.chat.setNotifyLevel('c-backend', 'none')
    expect((await api.mentions.mine()).map((m) => m.id)).toContain(older.id)
    expect((await mine()).map((i) => i.id)).toContain(older.id)
  })

  it('50 newer mentions in another workspace leave this one’s in its Activity, where they can be marked read', async () => {
    await api.users.viewAs('u-2')
    const older = await api.chat.send('c-general', `Ping ${YOUSSEF}`)
    await api.users.viewAs('u-7')
    for (let i = 0; i < 50; i++) await api.chat.send('c-design', `Look ${i} ${YOUSSEF}`)
    await api.users.viewAs('u-1')
    expect((await mine()).find((i) => i.id === older.id)?.read).toBe(false)
    await api.inbox.markRead('ws-eng', [older.id])
    expect((await mine()).find((i) => i.id === older.id)?.read).toBe(true)
  })
})

describe('a reply in my thread is one row, worked out as it reads now (review)', () => {
  const rowsFor = async (replyId: string) => (await mine()).filter((i) => i.replyId === replyId || i.id === replyId).map((i) => i.kind)

  it('an @all reply is the mention alone', async () => {
    const root = await api.chat.send('c-general', 'Who owns the build?')
    await api.users.viewAs('u-2')
    const reply = await api.chat.reply(root.id, '@all heads up, the build is red')
    await api.users.viewAs('u-1')
    expect(await rowsFor(reply.id)).toEqual(['mention'])
  })

  it('editing my name out leaves the thread row; editing it in leaves the mention alone', async () => {
    const root = await api.chat.send('c-general', 'Who owns the build?')
    await api.users.viewAs('u-2')
    const named = await api.chat.reply(root.id, `Asking ${YOUSSEF}`)
    await api.chat.edit({ kind: 'reply', id: named.id }, 'Asking around')
    const plain = await api.chat.reply(root.id, 'No one yet')
    await api.chat.edit({ kind: 'reply', id: plain.id }, `No one yet, ${YOUSSEF}?`)
    await api.users.viewAs('u-1')
    expect(await rowsFor(named.id)).toEqual(['thread'])
    expect(await rowsFor(plain.id)).toEqual(['mention'])
  })
})

describe('mention excerpt helper', () => {
  it('names come through as people read them', async () => {
    await api.users.viewAs('u-3')
    const m = await api.chat.send('c-general', `Thanks ${NOUR} and ${YOUSSEF}`)
    await api.users.viewAs('u-1')
    expect((await mine()).find((i) => i.id === m.id)?.excerpt).toBe('Thanks @Nour El-Sayed and @Youssef Abdelrahman')
  })
})
