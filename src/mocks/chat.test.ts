import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, ChatMessage } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { addReply, sendMessage } from './chat'
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
  hub = createMockHub(`test-chat-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

/** Adds `count` messages from another user to a channel, one second apart, oldest first. */
async function addMessages(channelId: string, count: number) {
  await db.update((d) => {
    for (let i = 0; i < count; i++) {
      d.messages.push({
        id: `m-extra-${i}`, channelId, senderId: 'u-2', content: `extra ${i}`,
        attachments: [], reactions: [], threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], editedAt: null,
        createdAt: new Date(Date.UTC(2030, 0, 1, 0, 0, i)).toISOString(),
      })
    }
  })
}

describe('chat.messages', () => {
  it('pages messages newest first by cursor', async () => {
    await addMessages('c-general', 40)
    const first = await api.chat.messages('c-general')
    expect(first.items).toHaveLength(30) // page size 30
    expect(first.items[0].createdAt >= first.items[1].createdAt).toBe(true)
    expect(typeof first.nextCursor).toBe('string') // opaque: only passed back
    const next = await api.chat.messages('c-general', first.nextCursor!)
    const last = first.items[29].createdAt
    expect(next.items.every((m) => m.createdAt <= last)).toBe(true)
    expect(next.items.some((m) => first.items.some((f) => f.id === m.id))).toBe(false)
  })

  it('walks every message exactly once, then ends with a null cursor', async () => {
    await addMessages('c-general', 40)
    const all: ChatMessage[] = []
    let cursor: string | undefined
    do {
      const page = await api.chat.messages('c-general', cursor)
      all.push(...page.items)
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    const expected = (await db.read()).messages.filter((m) => m.channelId === 'c-general')
    expect(all.map((m) => m.id).sort()).toEqual(expected.map((m) => m.id).sort())
    const times = all.map((m) => m.createdAt)
    expect(times).toEqual(times.slice().sort().reverse())
  })

  it('has a null cursor when the last page is exactly full', async () => {
    await db.update((d) => { d.messages = d.messages.filter((m) => m.channelId !== 'c-general') })
    await addMessages('c-general', 30)
    const page = await api.chat.messages('c-general')
    expect(page.items).toHaveLength(30)
    expect(page.nextCursor).toBeNull()
  })

  it('has a null cursor when everything fits on one page', async () => {
    const page = await api.chat.messages('c-general')
    expect(page.items.length).toBeLessThan(30)
    expect(page.nextCursor).toBeNull()
  })

  it('never drops or repeats messages that share one timestamp across a page boundary', async () => {
    const at = new Date(Date.UTC(2030, 0, 1)).toISOString()
    await db.update((d) => {
      for (let i = 0; i < 75; i++) {
        d.messages.push({
          id: `m-tie-${String(i).padStart(3, '0')}`, channelId: 'c-general', senderId: 'u-2', content: `tie ${i}`,
          attachments: [], reactions: [], threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], editedAt: null, createdAt: at,
        })
      }
    })
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await api.chat.messages('c-general', cursor)
      seen.push(...page.items.map((m) => m.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    const expected = (await db.read()).messages.filter((m) => m.channelId === 'c-general').length
    expect(seen).toHaveLength(expected)
    expect(new Set(seen).size).toBe(expected)
    expect(seen.slice(0, 3)).toEqual(['m-tie-074', 'm-tie-073', 'm-tie-072'])
  })

  it('throws ApiError 404 for an unknown channel', async () => {
    await expect(api.chat.messages('nope')).rejects.toMatchObject({ status: 404, detail: "Channel nope doesn't exist." })
  })
})

describe('chat.channels and unreadCount', () => {
  it('computes unreadCount for the current user and markRead clears it', async () => {
    const before = (await api.chat.channels('ws-eng')).find((c) => c.id === 'c-frontend')!
    expect(before.unreadCount).toBe(3)
    await api.chat.markRead('c-frontend')
    expect((await api.chat.channel('c-frontend')).unreadCount).toBe(0)
  })

  it('leaves 1 unread in one DM at the start', async () => {
    const dms = (await api.chat.channels('ws-eng')).filter((c) => c.kind === 'dm').map((c) => c.unreadCount)
    expect(dms.filter((n) => n > 0)).toEqual([1])
  })

  it('markRead saves the read time for that channel only', async () => {
    const before = (await db.read()).reads['u-1']!
    const t0 = new Date().toISOString()
    await api.chat.markRead('c-frontend')
    const reads = (await db.read()).reads['u-1']!
    expect(reads['c-frontend'] >= t0).toBe(true) // set to the current time
    expect(reads['c-frontend']).not.toBe(before['c-frontend'])
    expect(reads['c-dm-2']).toBe(before['c-dm-2'])
  })

  it('markRead throws ApiError 404 for an unknown channel', async () => {
    await expect(api.chat.markRead('nope')).rejects.toMatchObject({ status: 404 })
  })

  it('own messages do not count as unread', async () => {
    await db.update((d) => { d.reads['u-1'] = { ...d.reads['u-1'], 'c-backend': new Date(Date.now() - 3_600_000).toISOString() } }) // read an hour ago
    expect((await api.chat.channel('c-backend')).unreadCount).toBe(0)
    await sendMessage(db, hub, { channelId: 'c-backend', content: 'mine' })
    expect((await api.chat.channel('c-backend')).unreadCount).toBe(0)
    // someone else's message after the read time does count
    await db.update((d) => {
      d.messages.push({
        id: 'm-other', channelId: 'c-backend', senderId: 'u-2', content: 'theirs',
        attachments: [], reactions: [], threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], editedAt: null,
        createdAt: new Date(Date.now() + 60_000).toISOString(),
      })
    })
    expect((await api.chat.channel('c-backend')).unreadCount).toBe(1)
  })

  it('lists only the workspace\'s channels', async () => {
    const channels = await api.chat.channels('ws-eng')
    expect(channels.length).toBeGreaterThan(0)
    expect(channels.every((c) => c.workspaceId === 'ws-eng')).toBe(true)
  })

  it('throws ApiError 404 for an unknown channel', async () => {
    await expect(api.chat.channel('nope')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ApiError 404 for an unknown workspace', async () => {
    await expect(api.chat.channels('nope')).rejects.toMatchObject({ status: 404, detail: "Workspace nope doesn't exist." })
  })
})

describe('chat.message and replies', () => {
  it('gets a message and its replies', async () => {
    const parent = (await db.read()).replies[0]
    const message = await api.chat.message(parent.messageId)
    expect(message.id).toBe(parent.messageId)
    const replies = await api.chat.replies(parent.messageId)
    expect(replies.length).toBe(message.threadCount)
    expect(replies.every((r) => r.messageId === parent.messageId)).toBe(true)
    const times = replies.map((r) => r.createdAt)
    expect(times).toEqual(times.slice().sort())
  })

  it('throws ApiError 404 for an unknown message', async () => {
    await expect(api.chat.message('nope')).rejects.toMatchObject({ status: 404, detail: "Message nope doesn't exist." })
    await expect(api.chat.replies('nope')).rejects.toMatchObject({ status: 404 })
  })
})

describe('sendMessage', () => {
  it('parses ticket keys, bumps lastMessageAt and publishes', async () => {
    const m = await sendMessage(db, hub, { channelId: 'c-backend', content: 'NEX-101 and MOB-102, also NEX-101' })
    expect(m.linkedTicketKeys).toEqual(['NEX-101', 'MOB-102'])
    expect((await api.chat.channel('c-backend')).lastMessageAt).toBe(m.createdAt)
    expect(events).toEqual([{ type: 'messageReceived', message: m }])
  })

  it('stores the message as the current user, with no replies yet', async () => {
    const attachment = { id: 'a1', name: 'log.txt', size: 12, mimeType: 'text/plain', createdAt: '2026-10-26T00:00:00.000Z' }
    const m = await sendMessage(db, hub, { channelId: 'c-backend', content: 'hi', attachments: [attachment] })
    expect(m).toMatchObject({ senderId: 'u-1', channelId: 'c-backend', threadCount: 0, lastReplyAt: null, editedAt: null, reactions: [] })
    expect(m.attachments).toEqual([attachment])
    expect(await api.chat.message(m.id)).toEqual(m)
    expect((await api.chat.messages('c-backend')).items[0].id).toBe(m.id)
  })

  it('throws ApiError 404 for an unknown channel and publishes nothing', async () => {
    await expect(sendMessage(db, hub, { channelId: 'nope', content: 'x' })).rejects.toMatchObject({ status: 404 })
    expect(events).toEqual([])
  })

  it('hands back a copy, not stored state', async () => {
    const m = await sendMessage(db, hub, { channelId: 'c-backend', content: 'hi' })
    m.content = 'tampered'
    ;(events[0] as Extract<RealtimeEvent, { type: 'messageReceived' }>).message.content = 'tampered'
    expect((await api.chat.message(m.id)).content).toBe('hi')
  })
})

describe('addReply', () => {
  it('updates threadCount, lastReplyAt and the channel, and publishes', async () => {
    const parent = (await db.read()).messages.find((m) => m.channelId === 'c-backend' && m.threadCount === 0)!
    const reply = await addReply(db, hub, { messageId: parent.id, content: 'On it. NEX-104' })
    expect(reply).toMatchObject({ messageId: parent.id, channelId: 'c-backend', senderId: 'u-1', content: 'On it. NEX-104' })
    const after = await api.chat.message(parent.id)
    expect(after.threadCount).toBe(1)
    expect(after.lastReplyAt).toBe(reply.createdAt)
    expect((await api.chat.channel('c-backend')).lastMessageAt).toBe(reply.createdAt)
    expect((await api.chat.replies(parent.id)).map((r) => r.id)).toContain(reply.id)
    expect(events).toEqual([{ type: 'replyReceived', reply }])
  })

  it('increments an existing thread', async () => {
    const parent = (await db.read()).messages.find((m) => m.threadCount > 0)!
    await addReply(db, hub, { messageId: parent.id, content: 'one more' })
    expect((await api.chat.message(parent.id)).threadCount).toBe(parent.threadCount + 1)
  })

  it('throws ApiError 404 for an unknown message and publishes nothing', async () => {
    await expect(addReply(db, hub, { messageId: 'nope', content: 'x' })).rejects.toMatchObject({ status: 404 })
    expect(events).toEqual([])
  })

  it('hands back a copy, not stored state', async () => {
    const parent = (await db.read()).messages[0]
    const reply = await addReply(db, hub, { messageId: parent.id, content: 'hi' })
    reply.content = 'tampered'
    expect((await api.chat.replies(parent.id)).find((r) => r.id === reply.id)!.content).toBe('hi')
  })
})

describe('api results are copies', () => {
  it('changing a returned channel does not change the database', async () => {
    const channel = await api.chat.channel('c-general')
    channel.topic = 'tampered'
    channel.memberIds.push('zzz')
    expect((await api.chat.channel('c-general')).topic).not.toBe('tampered')
    expect((await api.chat.channel('c-general')).memberIds).not.toContain('zzz')
  })
})

describe('send and reply', () => {
  it('send stores trimmed text with its mentions', async () => {
    const message = await api.chat.send('c-general', '  Hi @[Nour](u-2) about @NEX-101 and @all ')
    expect(message.content).toBe('Hi @[Nour](u-2) about @NEX-101 and @all')
    expect(message.mentions).toEqual([
      { kind: 'user', id: 'u-2' },
      { kind: 'task', id: 'NEX-101' },
      { kind: 'all', id: 'all' },
    ])
    expect(message.linkedTicketKeys).toEqual(['NEX-101'])
    expect(message.senderId).toBe('u-1')
    expect(events.some((e) => e.type === 'messageReceived' && e.message.id === message.id)).toBe(true)
  })

  it('send refuses empty text, long text, a project the member is not on, and a private channel', async () => {
    await expect(api.chat.send('c-general', '  ')).rejects.toMatchObject({ status: 400, detail: 'Write a message first.' })
    await expect(api.chat.send('c-general', 'x'.repeat(4001))).rejects.toMatchObject({ detail: 'Keep the message under 4000 characters.' })
    await api.users.viewAs('u-8') // Tarek: not on Nexus Core, not in the DM
    await expect(api.chat.send('c-p-nex', 'x')).rejects.toMatchObject({ status: 403, detail: "You don't have access to this project." })
    await expect(api.chat.send('c-dm-1', 'x')).rejects.toMatchObject({ status: 403, detail: "You're not in this channel." })
    expect((await db.read()).messages.filter((m) => m.senderId === 'u-8' && m.content === 'x')).toHaveLength(0)
  })

  it('reply stores mentions and bumps the thread', async () => {
    const parent = (await db.read()).messages.find((m) => m.channelId === 'c-general')!
    const reply = await api.chat.reply(parent.id, 'ok @[Mariam](u-3)')
    expect(reply.mentions).toEqual([{ kind: 'user', id: 'u-3' }])
    expect((await db.read()).messages.find((m) => m.id === parent.id)!.threadCount).toBe(parent.threadCount + 1)
    await expect(api.chat.reply(parent.id, ' ')).rejects.toMatchObject({ detail: 'Write a message first.' })
  })
})

describe('message actions', () => {
  const msg = (message: { id: string }) => ({ kind: 'message' as const, id: message.id })

  it('react toggles me on and off; an empty emoji goes away', async () => {
    const sent = await api.chat.send('c-general', 'Ship it')
    await api.chat.react(msg(sent), '👍')
    expect((await api.chat.message(sent.id)).reactions).toEqual([{ emoji: '👍', userIds: ['u-1'] }])
    await api.users.viewAs('u-2')
    await api.chat.react(msg(sent), '👍')
    expect((await api.chat.message(sent.id)).reactions).toEqual([{ emoji: '👍', userIds: ['u-1', 'u-2'] }])
    await api.chat.react(msg(sent), '👍')
    await api.users.viewAs('u-1')
    await api.chat.react(msg(sent), '👍')
    expect((await api.chat.message(sent.id)).reactions).toEqual([])
  })

  it('react refuses an emoji outside REACTIONS', async () => {
    const sent = await api.chat.send('c-general', 'Ship it')
    await expect(api.chat.react(msg(sent), '🐍')).rejects.toMatchObject({ status: 400, detail: 'Pick one of the reactions shown.' })
  })

  it('react on a private channel I am not in is refused', async () => {
    const sent = await api.chat.send('c-release', 'Go/no-go at 4')
    await api.users.viewAs('u-3') // Mariam: not in #release-v2
    await expect(api.chat.react(msg(sent), '👍')).rejects.toMatchObject({ status: 403, detail: "You're not in this channel." })
  })

  it('edit re-parses mentions and keys, sets editedAt, keeps keys of tasks made from it', async () => {
    const sent = await api.chat.send('c-p-nex', 'Look at NEX-101 @[Nour](u-2)')
    await db.update((d) => {
      d.tickets.find((t) => t.key === 'NEX-102')!.linkedMessageId = sent.id
    })
    const edited = await api.chat.edit(msg(sent), 'Look at NEX-103 @[Mariam](u-3)')
    expect(edited.content).toBe('Look at NEX-103 @[Mariam](u-3)')
    expect(edited.mentions.some((m) => m.kind === 'user' && m.id === 'u-3')).toBe(true)
    expect(edited.mentions.some((m) => m.kind === 'user' && m.id === 'u-2')).toBe(false)
    expect([...(edited as ChatMessage).linkedTicketKeys].sort()).toEqual(['NEX-102', 'NEX-103'])
    expect((edited as ChatMessage).editedAt).toEqual(expect.any(String))
  })

  it('edit with the same text writes nothing and publishes nothing', async () => {
    const sent = await api.chat.send('c-general', 'Same')
    events.length = 0
    const edited = await api.chat.edit(msg(sent), '  Same  ')
    expect((edited as ChatMessage).editedAt).toBeNull()
    expect(events).toEqual([])
  })

  it("edit or remove someone else's message is refused", async () => {
    const sent = await api.chat.send('c-general', 'Mine')
    await api.users.viewAs('u-2')
    await expect(api.chat.edit(msg(sent), 'Yours')).rejects.toMatchObject({ status: 403, detail: 'You can only change your own messages.' })
    await expect(api.chat.remove(msg(sent))).rejects.toMatchObject({ status: 403, detail: 'You can only change your own messages.' })
  })

  it('edit or remove a comment card is refused', async () => {
    await api.users.viewAs('u-4') // Ahmed manages Mobile App
    await api.comments.create({ taskKey: 'MOB-104', kind: 'comment', body: 'Looks good', files: [] })
    const card = (await db.read()).messages.find((m) => m.commentId && m.senderId === 'u-4')!
    await expect(api.chat.edit(msg(card), 'Changed')).rejects.toMatchObject({ status: 400, detail: "This message can't be changed." })
    await expect(api.chat.remove(msg(card))).rejects.toMatchObject({ status: 400 })
  })

  it('remove keeps the row and its replies, clears content, files, mentions and reactions, sets deletedAt', async () => {
    const sent = await api.chat.send('c-general', 'Oops @[Nour](u-2) NEX-101')
    await api.chat.react(msg(sent), '👀')
    await api.chat.reply(sent.id, 'seen')
    await api.chat.remove(msg(sent))
    const row = await api.chat.message(sent.id)
    expect(row).toMatchObject({ content: '', attachments: [], mentions: [], reactions: [], linkedTicketKeys: [], threadCount: 1 })
    expect(row.deletedAt).toEqual(expect.any(String))
    expect(await api.chat.replies(sent.id)).toHaveLength(1)
    await expect(api.chat.edit(msg(sent), 'back')).rejects.toMatchObject({ status: 400 })
    await expect(api.chat.react(msg(sent), '👍')).rejects.toMatchObject({ status: 400 })
  })

  it('a reply can be reacted to, edited and removed by its author', async () => {
    const parent = await api.chat.send('c-general', 'Thread')
    const reply = await api.chat.reply(parent.id, 'first')
    const target = { kind: 'reply' as const, id: reply.id }
    await api.chat.react(target, '🎉')
    const edited = await api.chat.edit(target, 'first, edited')
    expect(edited).toMatchObject({ content: 'first, edited', reactions: [{ emoji: '🎉', userIds: ['u-1'] }] })
    expect((edited as { editedAt?: string | null }).editedAt).toEqual(expect.any(String))
    await api.chat.remove(target)
    const [row] = await api.chat.replies(parent.id)
    expect(row).toMatchObject({ content: '', reactions: [] })
    expect(row.deletedAt).toEqual(expect.any(String))
  })

  it('each write publishes messageChanged with the parent id for a reply', async () => {
    const parent = await api.chat.send('c-general', 'Thread')
    const reply = await api.chat.reply(parent.id, 'first')
    events.length = 0
    await api.chat.react({ kind: 'message', id: parent.id }, '👍')
    await api.chat.edit({ kind: 'reply', id: reply.id }, 'second')
    await api.chat.remove({ kind: 'reply', id: reply.id })
    expect(events).toEqual([
      { type: 'messageChanged', channelId: 'c-general', messageId: parent.id },
      { type: 'messageChanged', channelId: 'c-general', messageId: parent.id },
      { type: 'messageChanged', channelId: 'c-general', messageId: parent.id },
    ])
  })

  it('a stored message without deletedAt or taskEvent reads as a plain message', async () => {
    await addMessages('c-general', 1) // written the old way: no deletedAt, no taskEvent
    const row = await api.chat.message('m-extra-0')
    expect(row.deletedAt ?? null).toBeNull()
    expect(row.taskEvent ?? null).toBeNull()
    await api.users.viewAs('u-2')
    await api.chat.react({ kind: 'message', id: row.id }, '✅')
    expect(await api.chat.edit({ kind: 'message', id: row.id }, 'extra 0, edited')).toMatchObject({ content: 'extra 0, edited' })
  })
})

describe('channels', () => {
  const input = (over: Partial<Parameters<Api['chat']['createChannel']>[0]> = {}) => ({ workspaceId: 'ws-eng', name: 'design', topic: 'Screens and flows', isPrivate: false, memberIds: [], ...over })

  it('create adds me, publishes channelChanged', async () => {
    const channel = await api.chat.createChannel(input({ memberIds: ['u-3'] }))
    expect(channel).toMatchObject({ kind: 'channel', name: 'design', topic: 'Screens and flows', isPrivate: false, unreadCount: 0 })
    expect([...channel.memberIds].sort()).toEqual(['u-1', 'u-3'])
    expect(events).toContainEqual({ type: 'channelChanged', channelId: channel.id })
    expect((await api.chat.channels('ws-eng')).some((c) => c.id === channel.id)).toBe(true)
  })

  it('name must match the pattern and be unique in the workspace', async () => {
    await expect(api.chat.createChannel(input({ name: 'Design Team' }))).rejects.toMatchObject({ status: 400, detail: 'Use lowercase letters, numbers and hyphens.' })
    await expect(api.chat.createChannel(input({ name: 'general' }))).rejects.toMatchObject({ status: 400, detail: 'A channel with this name already exists.' })
    await expect(api.chat.createChannel(input({ topic: 'x'.repeat(251) }))).rejects.toMatchObject({ status: 400 })
  })

  it('a private channel needs someone besides me', async () => {
    await expect(api.chat.createChannel(input({ isPrivate: true, memberIds: [] }))).rejects.toMatchObject({ status: 400, detail: 'Add at least one person.' })
  })

  it('members and admins can edit; others are refused', async () => {
    await api.users.viewAs('u-3')
    const channel = await api.chat.createChannel(input({ isPrivate: true, memberIds: ['u-6'] }))
    await api.users.viewAs('u-6')
    expect((await api.chat.updateChannel(channel.id, { topic: 'New topic' })).topic).toBe('New topic')
    await api.users.viewAs('u-1') // admin, not a member
    expect((await api.chat.updateChannel(channel.id, { name: 'design-2' })).name).toBe('design-2')
    await api.users.viewAs('u-8')
    await expect(api.chat.updateChannel(channel.id, { topic: 'Mine' })).rejects.toMatchObject({ status: 403 })
  })

  it('project channels and DMs refuse edits', async () => {
    await expect(api.chat.updateChannel('c-p-nex', { topic: 'x' })).rejects.toMatchObject({ status: 400, detail: 'This channel follows its project.' })
    await expect(api.chat.updateChannel('c-dm-1', { topic: 'x' })).rejects.toMatchObject({ status: 400, detail: "Direct messages can't be edited." })
  })

  it('an editor cannot remove themselves', async () => {
    const channel = await api.chat.createChannel(input({ memberIds: ['u-3'] }))
    await expect(api.chat.updateChannel(channel.id, { memberIds: ['u-3'] })).rejects.toMatchObject({ status: 400, detail: "You can't remove yourself." })
  })

  it('channels() lists a private channel or DM only to its members', async () => {
    await api.users.viewAs('u-3') // Mariam: not in #release-v2 or c-dm-1
    const ids = (await api.chat.channels('ws-eng')).map((c) => c.id)
    expect(ids).not.toContain('c-release')
    expect(ids).not.toContain('c-dm-1')
    expect(ids).toContain('c-dm-2')
    expect(ids).toContain('c-general')
  })

  it('channel() and messages() of a private channel I am not in are refused', async () => {
    await api.users.viewAs('u-3')
    await expect(api.chat.channel('c-release')).rejects.toMatchObject({ status: 403, detail: "You're not in this channel." })
    await expect(api.chat.messages('c-release')).rejects.toMatchObject({ status: 403 })
  })
})

describe('a private thread', () => {
  it('message(), replies() and markRead() of a private channel I am not in are refused', async () => {
    const secret = await api.chat.send('c-release', 'the secret')
    await api.chat.reply(secret.id, 'secret reply')
    await api.users.viewAs('u-3') // Mariam: not in #release-v2
    await expect(api.chat.message(secret.id)).rejects.toMatchObject({ status: 403, detail: "You're not in this channel." })
    await expect(api.chat.replies(secret.id)).rejects.toMatchObject({ status: 403 })
    await expect(api.chat.markRead('c-release')).rejects.toMatchObject({ status: 403 })
  })
})

describe('read state per person', () => {
  it('my markRead does not clear the badge for someone else', async () => {
    await api.users.viewAs('u-3')
    await api.chat.send('c-general', 'Lunch at 1?')
    await api.users.viewAs('u-1')
    await api.users.viewAs('u-2')
    const before = (await api.chat.channel('c-general')).unreadCount
    await api.users.viewAs('u-1')
    await api.chat.markRead('c-general')
    expect((await api.chat.channel('c-general')).unreadCount).toBe(0)
    await api.users.viewAs('u-2')
    expect((await api.chat.channel('c-general')).unreadCount).toBe(before)
    expect(before).toBeGreaterThan(0)
  })

  it('deleted messages do not count as unread', async () => {
    await api.users.viewAs('u-3')
    const sent = await api.chat.send('c-general', 'Oops')
    await api.users.viewAs('u-2')
    const before = (await api.chat.channel('c-general')).unreadCount
    await api.users.viewAs('u-3')
    await api.chat.remove({ kind: 'message', id: sent.id })
    await api.users.viewAs('u-2')
    expect((await api.chat.channel('c-general')).unreadCount).toBe(before - 1)
  })
})
