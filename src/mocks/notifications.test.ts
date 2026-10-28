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

describe('mention excerpt helper', () => {
  it('names come through as people read them', async () => {
    await api.users.viewAs('u-3')
    const m = await api.chat.send('c-general', `Thanks ${NOUR} and ${YOUSSEF}`)
    await api.users.viewAs('u-1')
    expect((await mine()).find((i) => i.id === m.id)?.excerpt).toBe('Thanks @Nour El-Sayed and @Youssef Abdelrahman')
  })
})
