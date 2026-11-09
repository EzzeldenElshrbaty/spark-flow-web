import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, ChatMessage } from '@/api/types'
import { bodyText, parseBody } from '@/lib/messageBody'
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
        id: `m-extra-${i}`, channelId, seq: 1000 + i, senderId: 'u-2', content: `extra ${i}`,
        attachments: [], reactions: [], threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], body: [], editedAt: null,
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
          id: `m-tie-${String(i).padStart(3, '0')}`, channelId: 'c-general', seq: 1000 + i, senderId: 'u-2', content: `tie ${i}`,
          attachments: [], reactions: [], threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], body: [], editedAt: null, createdAt: at,
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
    await expect(api.chat.messages('nope')).rejects.toMatchObject({ status: 404, detail: "Channel nope doesn’t exist." })
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

  it('markRead moves the marker for that channel only', async () => {
    const before = (await db.read()).channelState['u-1']!
    await api.chat.markRead('c-frontend')
    const after = (await db.read()).channelState['u-1']!
    expect(after['c-frontend'].lastReadSeq).toBe(before['c-frontend'].lastReadSeq + 3)
    expect(after['c-dm-2']).toEqual(before['c-dm-2'])
  })

  it('markRead throws ApiError 404 for an unknown channel', async () => {
    await expect(api.chat.markRead('nope')).rejects.toMatchObject({ status: 404 })
  })

  it('own messages do not count as unread', async () => {
    await db.update((d) => { d.channelState['u-1']['c-backend'].lastReadSeq = d.messages.filter((m) => m.channelId === 'c-backend').length }) // read to the end
    expect((await api.chat.channel('c-backend')).unreadCount).toBe(0)
    await sendMessage(db, hub, { channelId: 'c-backend', content: 'mine' })
    expect((await api.chat.channel('c-backend')).unreadCount).toBe(0)
    // someone else's message after the read time does count
    await db.update((d) => {
      d.messages.push({
        id: 'm-other', channelId: 'c-backend', seq: 999, senderId: 'u-2', content: 'theirs',
        attachments: [], reactions: [], threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], body: [], editedAt: null,
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
    await expect(api.chat.channels('nope')).rejects.toMatchObject({ status: 404, detail: "Workspace nope doesn’t exist." })
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
    await expect(api.chat.message('nope')).rejects.toMatchObject({ status: 404, detail: "Message nope doesn’t exist." })
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
    const attachment = {
      id: 'a1', name: 'log.txt', size: 12, mimeType: 'text/plain', createdAt: '2026-10-26T00:00:00.000Z',
      uploadedBy: 'u-1', title: 'log.txt', description: '', scanStatus: 'clean' as const, thumbUrl: null, previewUrl: null, deletedAt: null, snippet: null, folderId: null,
    }
    const m = await sendMessage(db, hub, { channelId: 'c-backend', content: 'hi', attachments: [attachment] })
    expect(m).toMatchObject({ senderId: 'u-1', channelId: 'c-backend', threadCount: 0, lastReplyAt: null, editedAt: null, reactions: [] })
    expect(m.attachments).toEqual([attachment])
    expect(await api.chat.message(m.id)).toEqual({ ...m, replyUserIds: [], following: true, threadMuted: false }) // who replied, and following, are worked out on read
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
    await expect(api.chat.send('c-general', 'x'.repeat(40_001))).rejects.toMatchObject({ detail: 'Keep the message under 40000 characters.' })
    await api.users.viewAs('u-8') // Tarek: not on Nexus Core, not in the DM
    await expect(api.chat.send('c-p-nex', 'x')).rejects.toMatchObject({ status: 403, detail: "You don’t have access to this project." })
    await expect(api.chat.send('c-dm-1', 'x')).rejects.toMatchObject({ status: 403, detail: "You’re not in this channel." })
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

  it('react puts me on and takes me off; an empty emoji goes away', async () => {
    const sent = await api.chat.send('c-general', 'Ship it')
    await api.chat.react(msg(sent), '👍', true)
    expect((await api.chat.message(sent.id)).reactions).toEqual([{ emoji: '👍', userIds: ['u-1'] }])
    await api.users.viewAs('u-2')
    await api.chat.react(msg(sent), '👍', true)
    expect((await api.chat.message(sent.id)).reactions).toEqual([{ emoji: '👍', userIds: ['u-1', 'u-2'] }])
    await api.chat.react(msg(sent), '👍', false)
    await api.users.viewAs('u-1')
    await api.chat.react(msg(sent), '👍', false)
    expect((await api.chat.message(sent.id)).reactions).toEqual([])
  })

  it('a retried reaction changes nothing (spec §8: writes are idempotent)', async () => {
    const sent = await api.chat.send('c-general', 'Ship it')
    await api.chat.react(msg(sent), '👍', true)
    await api.chat.react(msg(sent), '👍', true)
    expect((await api.chat.message(sent.id)).reactions).toEqual([{ emoji: '👍', userIds: ['u-1'] }])
    await api.chat.react(msg(sent), '👍', false)
    await api.chat.react(msg(sent), '👍', false)
    expect((await api.chat.message(sent.id)).reactions).toEqual([])
  })

  it('react takes any one emoji (spec 6.6), and refuses text or several emoji', async () => {
    const sent = await api.chat.send('c-general', 'Ship it')
    await api.chat.react(msg(sent), '🐍', true)
    await api.chat.react(msg(sent), '👍🏽', true)
    expect((await api.chat.message(sent.id)).reactions.map((r) => r.emoji)).toEqual(['🐍', '👍🏽'])
    for (const bad of ['ok', '🐍🐍', '', '1'])
      await expect(api.chat.react(msg(sent), bad, true)).rejects.toMatchObject({ status: 400, detail: 'Pick an emoji.' })
  })

  it('a message takes at most 50 different emoji; adding to one already there still works', async () => {
    const sent = await api.chat.send('c-general', 'Popular')
    const fifty = [...'😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🤩🥳😏😒😞😔😟😕🙁😣😖😫😩🥺😢😭😤😠😡🤬🤯']
    expect(fifty).toHaveLength(50)
    await db.update((d) => {
      d.messages.find((m) => m.id === sent.id)!.reactions = fifty.map((emoji) => ({ emoji, userIds: ['u-2'] }))
    })
    await expect(api.chat.react(msg(sent), '🐍', true)).rejects.toMatchObject({ status: 400, detail: 'This message has 50 different reactions already.' })
    await api.chat.react(msg(sent), '😀', true)
    expect((await api.chat.message(sent.id)).reactions[0].userIds).toEqual(['u-2', 'u-1'])
  })

  it('react on a private channel I am not in is refused', async () => {
    const sent = await api.chat.send('c-release', 'Go/no-go at 4')
    await api.users.viewAs('u-3') // Mariam: not in #release-v2
    await expect(api.chat.react(msg(sent), '👍', true)).rejects.toMatchObject({ status: 403, detail: "You’re not in this channel." })
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
    await expect(api.chat.edit(msg(card), 'Changed')).rejects.toMatchObject({ status: 400, detail: "This message can’t be changed." })
    await expect(api.chat.remove(msg(card))).rejects.toMatchObject({ status: 400 })
  })

  it('remove keeps the row and its replies, clears content, files, mentions and reactions, sets deletedAt', async () => {
    const sent = await api.chat.send('c-general', 'Oops @[Nour](u-2) NEX-101')
    await api.chat.react(msg(sent), '👀', true)
    await api.chat.reply(sent.id, 'seen')
    await api.chat.remove(msg(sent))
    const row = await api.chat.message(sent.id)
    expect(row).toMatchObject({ content: '', attachments: [], mentions: [], reactions: [], linkedTicketKeys: [], threadCount: 1 })
    expect(row.deletedAt).toEqual(expect.any(String))
    expect(await api.chat.replies(sent.id)).toHaveLength(1)
    await expect(api.chat.edit(msg(sent), 'back')).rejects.toMatchObject({ status: 400 })
    await expect(api.chat.react(msg(sent), '👍', true)).rejects.toMatchObject({ status: 400 })
  })

  it('a reply can be reacted to, edited and removed by its author', async () => {
    const parent = await api.chat.send('c-general', 'Thread')
    const reply = await api.chat.reply(parent.id, 'first')
    const target = { kind: 'reply' as const, id: reply.id }
    await api.chat.react(target, '🎉', true)
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
    await api.chat.react({ kind: 'message', id: parent.id }, '👍', true)
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
    await api.chat.react({ kind: 'message', id: row.id }, '✅', true)
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
    await expect(api.chat.createChannel(input({ name: 'general' }))).rejects.toMatchObject({ status: 400, detail: 'That name is taken.' })
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
    await api.users.viewAs('u-1') // admin, not a member: a private channel stays its members' (M12)
    await expect(api.chat.updateChannel(channel.id, { name: 'design-2' })).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-8')
    await expect(api.chat.updateChannel(channel.id, { topic: 'Mine' })).rejects.toMatchObject({ status: 403 })
  })

  it('project channels and DMs refuse edits', async () => {
    await expect(api.chat.updateChannel('c-p-nex', { topic: 'x' })).rejects.toMatchObject({ status: 400, detail: 'This channel follows its project.' })
    await expect(api.chat.updateChannel('c-dm-1', { topic: 'x' })).rejects.toMatchObject({ status: 400, detail: "Direct messages can’t be edited." })
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
    await expect(api.chat.channel('c-release')).rejects.toMatchObject({ status: 403, detail: "You’re not in this channel." })
    await expect(api.chat.messages('c-release')).rejects.toMatchObject({ status: 403 })
  })
})

describe('a private thread', () => {
  it('message(), replies() and markRead() of a private channel I am not in are refused', async () => {
    const secret = await api.chat.send('c-release', 'the secret')
    await api.chat.reply(secret.id, 'secret reply')
    await api.users.viewAs('u-3') // Mariam: not in #release-v2
    await expect(api.chat.message(secret.id)).rejects.toMatchObject({ status: 403, detail: "You’re not in this channel." })
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

describe('direct messages', () => {
  it('openDm creates a DM with me and them, and lists it to us only', async () => {
    const dm = await api.chat.openDm('ws-eng', ['u-6', 'u-5'])
    expect(dm).toMatchObject({ kind: 'dm', name: null, topic: '', isPrivate: true, workspaceId: 'ws-eng' })
    expect([...dm.memberIds].sort()).toEqual(['u-1', 'u-5', 'u-6'])
    expect(events).toContainEqual({ type: 'channelChanged', channelId: dm.id })
    expect((await api.chat.channels('ws-eng')).some((c) => c.id === dm.id)).toBe(true)
    await api.users.viewAs('u-8')
    expect((await api.chat.channels('ws-eng')).some((c) => c.id === dm.id)).toBe(false)
  })

  it('the same people in any order get the same DM, and nothing is published', async () => {
    const first = await api.chat.openDm('ws-eng', ['u-6', 'u-5'])
    await api.users.viewAs('u-5')
    events.length = 0
    const again = await api.chat.openDm('ws-eng', ['u-1', 'u-6', 'u-5'])
    expect(again.id).toBe(first.id)
    expect(events).toEqual([])
    // The seeded DM between u-1 and u-2 is found too.
    await api.users.viewAs('u-2')
    expect((await api.chat.openDm('ws-eng', ['u-1'])).id).toBe('c-dm-1')
  })

  it('no one else, or more than 8 others, is refused; unknown people are not found', async () => {
    await expect(api.chat.openDm('ws-eng', [])).rejects.toMatchObject({ status: 400, detail: 'Pick at least one person.' })
    await expect(api.chat.openDm('ws-eng', ['u-1'])).rejects.toMatchObject({ status: 400, detail: 'Pick at least one person.' })
    await expect(api.chat.openDm('ws-eng', ['u-2', 'u-3', 'u-4', 'u-5', 'u-6', 'u-7', 'u-8', 'u-9', 'u-10'])).rejects.toMatchObject({ status: 400, detail: 'A conversation can have up to 9 people.' })
    await expect(api.chat.openDm('ws-eng', ['u-nobody'])).rejects.toMatchObject({ status: 404 })
  })
})

describe('archiving channels', () => {
  const archived = { status: 400, detail: 'This channel is archived.' }
  it('archiving is for Admins (spec 6.1): a member is refused', async () => {
    await api.users.viewAs('u-3') // Mariam, in #frontend-dev
    await expect(api.chat.archiveChannel('c-frontend')).rejects.toMatchObject({ status: 403, detail: 'Only admins can archive channels.' })
  })
  it('an Admin archives a channel; sending, replying, reacting, editing and deleting are then refused', async () => {
    const mine = await api.chat.send('c-frontend', 'Before')
    const channel = await api.chat.archiveChannel('c-frontend')
    expect(channel.archivedAt).toEqual(expect.any(String))
    const target = { kind: 'message' as const, id: mine.id }
    await expect(api.chat.send('c-frontend', 'After')).rejects.toMatchObject(archived)
    await expect(api.chat.reply(mine.id, 'After')).rejects.toMatchObject(archived)
    await expect(api.chat.react(target, '👍', true)).rejects.toMatchObject(archived)
    await expect(api.chat.edit(target, 'Changed')).rejects.toMatchObject(archived)
    await expect(api.chat.remove(target)).rejects.toMatchObject(archived)
  })
  it('a member is refused a restore with the restore’s own reason (UX Phase 1, 1.6)', async () => {
    await api.chat.archiveChannel('c-frontend')
    await api.users.viewAs('u-3') // Mariam, in #frontend-dev
    await expect(api.chat.restoreChannel('c-frontend')).rejects.toMatchObject({ status: 403, detail: 'Only admins can restore channels.' })
  })
  it('restore makes it writable again', async () => {
    await api.chat.archiveChannel('c-frontend')
    expect((await api.chat.restoreChannel('c-frontend')).archivedAt ?? null).toBeNull()
    expect((await api.chat.send('c-frontend', 'Back')).content).toBe('Back')
  })
  it("a project channel and a DM can't be archived here", async () => {
    await expect(api.chat.archiveChannel('c-p-nex')).rejects.toMatchObject({ status: 400, detail: 'This channel follows its project.' })
    await expect(api.chat.archiveChannel('c-dm-1')).rejects.toMatchObject({ status: 400, detail: "Conversations can’t be archived." })
  })
  it("a non-member of a private channel can't archive it", async () => {
    await api.users.viewAs('u-3') // not in #release-v2
    await expect(api.chat.archiveChannel('c-release')).rejects.toMatchObject({ status: 403 })
  })
  it('archive publishes channelChanged', async () => {
    await api.chat.archiveChannel('c-frontend')
    expect(events).toContainEqual({ type: 'channelChanged', channelId: 'c-frontend' })
  })
})

describe('joining and leaving channels', () => {
  it('join adds me; leave removes me', async () => {
    await api.users.viewAs('u-8') // Tarek, not in #backend
    expect((await api.chat.join('c-backend')).memberIds).toContain('u-8')
    expect((await api.chat.leave('c-backend')).memberIds).not.toContain('u-8')
    expect(events.filter((e) => e.type === 'channelChanged')).toHaveLength(2)
  })
  it('join a private or archived channel is refused', async () => {
    await api.users.viewAs('u-3')
    await expect(api.chat.join('c-release')).rejects.toMatchObject({ status: 400, detail: 'You can only join public channels.' })
    await api.users.viewAs('u-1')
    await api.chat.archiveChannel('c-backend')
    await api.users.viewAs('u-8')
    await expect(api.chat.join('c-backend')).rejects.toMatchObject({ status: 400, detail: 'This channel is archived.' })
  })
  it('leave a project channel or a DM is refused', async () => {
    await expect(api.chat.leave('c-p-nex')).rejects.toMatchObject({ status: 400, detail: 'This channel follows its project.' })
    await expect(api.chat.leave('c-dm-1')).rejects.toMatchObject({ status: 400, detail: "You can’t leave a conversation." })
  })
})

describe('admins and private channels', () => {
  it("an Admin not in a private channel can't edit or archive it", async () => {
    await db.update((d) => void (d.channels.find((c) => c.id === 'c-release')!.memberIds = ['u-2', 'u-4']))
    const refused = { status: 403, detail: "You’re not in this channel." }
    await expect(api.chat.updateChannel('c-release', { topic: 'x' })).rejects.toMatchObject(refused)
    await expect(api.chat.archiveChannel('c-release')).rejects.toMatchObject(refused)
  })
  it('a name taken by a hidden private channel reads like any other clash', async () => {
    await api.users.viewAs('u-3') // not in #release-v2
    await expect(api.chat.createChannel({ workspaceId: 'ws-eng', name: 'release-v2', topic: '', isPrivate: false, memberIds: [] })).rejects.toMatchObject({ status: 400, detail: 'That name is taken.' })
  })
})

describe('archiving a channel twice', () => {
  it('keeps its first archivedAt and sends no second event', async () => {
    const first = await api.chat.archiveChannel('c-frontend')
    events.length = 0
    await new Promise((r) => setTimeout(r, 5))
    const again = await api.chat.archiveChannel('c-frontend')
    expect(again.archivedAt).toBe(first.archivedAt)
    expect(events).toEqual([])
  })
})


describe('read state by seq (spec §7 ChannelMember, §8 read marker)', () => {
  const seqs = async (channelId: string) => (await db.read()).messages.filter((m) => m.channelId === channelId).map((m) => m.seq)

  it('every message has a seq, 1..n per channel in time order', async () => {
    const data = await db.read()
    for (const c of data.channels) {
      const own = data.messages.filter((m) => m.channelId === c.id).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      expect(own.map((m) => m.seq)).toEqual(own.map((_, i) => i + 1))
    }
  })

  it('send gives the next seq in that channel only, and the channel reports it as lastSeq', async () => {
    const before = await seqs('c-backend')
    const other = await seqs('c-general')
    const sent = await api.chat.send('c-backend', 'next')
    expect(sent.seq).toBe(Math.max(...before) + 1)
    expect(await seqs('c-general')).toEqual(other)
    expect((await api.chat.channel('c-backend')).lastSeq).toBe(sent.seq)
  })

  it('@here reaches the channel’s active members, not away or offline ones; @channel reaches all of them (spec 6.8)', async () => {
    const reached = async (text: string) => {
      events.length = 0
      await api.chat.send('c-general', text)
      return events.filter((e) => e.type === 'notificationCreated').map((e) => (e as { userId: string }).userId).sort()
    }
    expect(await reached('Standup in 5 @here')).toEqual(['u-2', 'u-3', 'u-5', 'u-9'])
    expect(await reached('Release notes @channel')).toEqual(['u-2', 'u-3', 'u-4', 'u-5', 'u-6', 'u-7', 'u-8', 'u-9'])
  })

  it('sending the same client id twice stores one message and publishes once', async () => {
    const first = await api.chat.send('c-backend', 'once', 'client-1')
    events.length = 0
    const again = await api.chat.send('c-backend', 'once', 'client-1')
    expect(again).toEqual(first)
    expect(first.clientId).toBe('client-1')
    expect((await db.read()).messages.filter((m) => m.clientId === 'client-1')).toHaveLength(1)
    expect(events).toEqual([])
  })

  it('a reply retried with the same client id is stored once (spec §8)', async () => {
    const root = await api.chat.send('c-general', 'Question')
    const first = await api.chat.reply(root.id, 'Answer', undefined, false, undefined, 'reply-1')
    events.length = 0
    const again = await api.chat.reply(root.id, 'Answer', undefined, false, undefined, 'reply-1')
    expect(again.id).toBe(first.id)
    expect((await api.chat.replies(root.id)).filter((r) => r.content === 'Answer')).toHaveLength(1)
    expect((await api.chat.message(root.id)).threadCount).toBe(1)
    expect(events).toEqual([])
  })

  it('the same client id from another person is a different message', async () => {
    const mine = await api.chat.send('c-general', 'hi', 'client-2')
    await api.users.viewAs('u-2')
    const theirs = await api.chat.send('c-general', 'hi', 'client-2')
    expect(theirs.id).not.toBe(mine.id)
  })

  it('unreadCount counts messages from others after my lastReadSeq', async () => {
    const channel = await api.chat.channel('c-frontend')
    expect(channel.unreadCount).toBe(3)
    expect(channel.lastReadSeq).toBe(channel.lastSeq - 3)
  })

  it('markRead with a seq moves my marker there, publishes it, and never moves it back', async () => {
    const { lastSeq } = await api.chat.channel('c-frontend')
    events.length = 0
    await api.chat.markRead('c-frontend', lastSeq - 1)
    expect(await api.chat.channel('c-frontend')).toMatchObject({ lastReadSeq: lastSeq - 1, unreadCount: 1 })
    expect(events).toEqual([{ type: 'readChanged', userId: 'u-1', channelId: 'c-frontend', seq: lastSeq - 1 }])
    await api.chat.markRead('c-frontend', 1)
    expect((await api.chat.channel('c-frontend')).lastReadSeq).toBe(lastSeq - 1)
  })

  it('markUnread moves my marker to just before that message, either way, and publishes it', async () => {
    const { lastSeq } = await api.chat.channel('c-frontend')
    await api.chat.markRead('c-frontend')
    events.length = 0
    await api.chat.markUnread('c-frontend', lastSeq - 1)
    expect(await api.chat.channel('c-frontend')).toMatchObject({ lastReadSeq: lastSeq - 2, unreadCount: 2 })
    expect(events).toEqual([{ type: 'readChanged', userId: 'u-1', channelId: 'c-frontend', seq: lastSeq - 2 }])
    // Forward too: what came before that message counts as read now.
    await api.chat.markUnread('c-frontend', lastSeq)
    expect(await api.chat.channel('c-frontend')).toMatchObject({ lastReadSeq: lastSeq - 1, unreadCount: 1 })
  })

  it('markUnread refuses a seq that is no message of the channel, and a channel I may not read', async () => {
    const { lastSeq } = await api.chat.channel('c-frontend')
    for (const seq of [0, lastSeq + 1, 1.5]) {
      await expect(api.chat.markUnread('c-frontend', seq)).rejects.toMatchObject({ status: 400, detail: "That message isn’t in this channel." })
    }
    await expect(api.chat.markUnread('nope', 1)).rejects.toMatchObject({ status: 404 })
    await api.chat.send('c-release', 'the secret')
    await api.users.viewAs('u-3') // Mariam: not in #release-v2
    await expect(api.chat.markUnread('c-release', 1)).rejects.toMatchObject({ status: 403 })
  })

  it('markRead without a seq, or past the end, reads to the last message', async () => {
    const { lastSeq } = await api.chat.channel('c-frontend')
    await api.chat.markRead('c-frontend', lastSeq + 50)
    expect((await api.chat.channel('c-frontend')).lastReadSeq).toBe(lastSeq)
    await api.chat.send('c-frontend', 'more')
    await api.chat.markRead('c-frontend')
    expect((await api.chat.channel('c-frontend')).lastReadSeq).toBe(lastSeq + 1)
  })

  it('star and mute are mine alone and publish my state change', async () => {
    events.length = 0
    expect(await api.chat.setStarred('c-general', true)).toMatchObject({ starred: true, muted: false })
    expect(await api.chat.setMuted('c-general', true)).toMatchObject({ starred: true, muted: true })
    expect(events).toEqual([
      { type: 'readChanged', userId: 'u-1', channelId: 'c-general' },
      { type: 'readChanged', userId: 'u-1', channelId: 'c-general' },
    ])
    await api.users.viewAs('u-2')
    expect(await api.chat.channel('c-general')).toMatchObject({ starred: false, muted: false })
  })

  it('star and mute of a private channel I am not in are refused', async () => {
    await api.users.viewAs('u-3') // Mariam: not in #release-v2
    await expect(api.chat.setStarred('c-release', true)).rejects.toMatchObject({ status: 403 })
    await expect(api.chat.setMuted('c-release', true)).rejects.toMatchObject({ status: 403 })
  })
})

describe('jumping through a channel (spec 6.2 date menu, §8 around)', () => {
  const general = async () => (await db.read()).messages.filter((m) => m.channelId === 'c-general').sort((a, b) => a.seq - b.seq)

  it('jumpTarget is the first message at or after a time; the very beginning is the first message', async () => {
    const all = await general()
    expect(await api.chat.jumpTarget('c-general', null)).toBe(all[0].seq)
    expect(await api.chat.jumpTarget('c-general', all[2].createdAt)).toBe(all[2].seq)
    expect(await api.chat.jumpTarget('c-general', new Date(Date.parse(all[2].createdAt) - 1).toISOString())).toBe(all[2].seq)
  })

  it('jumpTarget is null when nothing is that recent, and refuses a channel I cannot read', async () => {
    expect(await api.chat.jumpTarget('c-general', '2999-01-01T00:00:00.000Z')).toBeNull()
    await api.users.viewAs('u-3')
    await expect(api.chat.jumpTarget('c-release', null)).rejects.toMatchObject({ status: 403 })
  })

  it('messagesAfter pages toward the newest, newest first, ending with a null cursor', async () => {
    await addMessages('c-general', 40)
    const all = await general()
    const first = await api.chat.messagesAfter('c-general', String(all[0].seq))
    expect(first.items.map((m) => m.seq)).toEqual(all.slice(1, 31).map((m) => m.seq).reverse())
    expect(first.nextCursor).not.toBeNull()
    const rest = await api.chat.messagesAfter('c-general', first.nextCursor!)
    expect(rest.items.map((m) => m.seq)).toEqual(all.slice(31).map((m) => m.seq).reverse())
    expect(rest.nextCursor).toBeNull()
  })

  it('messagesBefore pages back from a seq, newest first; its cursor goes on with messages()', async () => {
    await addMessages('c-general', 40)
    const all = await general()
    const at = all[all.length - 5].seq
    const first = await api.chat.messagesBefore('c-general', at)
    const older = all.filter((m) => m.seq < at)
    expect(first.items.map((m) => m.seq)).toEqual(older.slice(-30).map((m) => m.seq).reverse())
    expect(first.nextCursor).not.toBeNull()
    const rest = await api.chat.messages('c-general', first.nextCursor!)
    expect(rest.items.map((m) => m.seq)).toEqual(older.slice(0, -30).map((m) => m.seq).reverse())
  })
})

describe('message bodies and system messages (spec 6.3, §7)', () => {
  it('stores the body worked out from the text on send, reply and edit', async () => {
    const sent = await api.chat.send('c-backend', 'Ship *NEX-103*')
    expect(sent.body).toEqual([{ type: 'p', children: [{ type: 'text', text: 'Ship ' }, { type: 'task', key: 'NEX-103' }] }])
    const edited = await api.chat.edit({ kind: 'message', id: sent.id }, 'Ship _today_')
    expect(edited.body).toEqual([{ type: 'p', children: [{ type: 'text', text: 'Ship ' }, { type: 'text', text: 'today', marks: ['i'] }] }])
    const reply = await api.chat.reply(sent.id, '`ok`')
    expect(reply.body).toEqual([{ type: 'p', children: [{ type: 'text', text: 'ok', marks: ['code'] }] }])
  })

  it('a deleted message has an empty body', async () => {
    const sent = await api.chat.send('c-backend', 'gone')
    await api.chat.remove({ kind: 'message', id: sent.id })
    expect((await api.chat.message(sent.id)).body).toEqual([])
  })

  it('joining and leaving post a system message from that person, which is never unread', async () => {
    await api.users.viewAs('u-3')
    await api.chat.join('c-general').catch(() => {}) // may already be a member
    await api.chat.leave('c-general')
    await api.chat.join('c-general')
    const own = (await db.read()).messages.filter((m) => m.channelId === 'c-general' && m.system)
    expect(own.slice(-2).map((m) => [m.senderId, m.system!.kind])).toEqual([
      ['u-3', 'left'],
      ['u-3', 'joined'],
    ])
    await api.users.viewAs('u-1')
    const before = (await api.chat.channel('c-general')).unreadCount
    await api.users.viewAs('u-3')
    await api.chat.leave('c-general')
    await api.users.viewAs('u-1')
    expect((await api.chat.channel('c-general')).unreadCount).toBe(before)
  })

  it('renaming a channel or changing its topic posts what changed', async () => {
    const channel = await api.chat.createChannel({ workspaceId: 'ws-eng', name: 'ops', topic: '', isPrivate: false, memberIds: [] })
    await api.chat.updateChannel(channel.id, { name: 'ops-2', topic: 'Pager rota' })
    const system = (await db.read()).messages.filter((m) => m.channelId === channel.id && m.system).map((m) => m.system)
    expect(system).toEqual([
      { kind: 'renamed', from: 'ops', to: 'ops-2' },
      { kind: 'topic', to: 'Pager rota' },
    ])
  })

  it('a system message cannot be edited or deleted', async () => {
    await api.users.viewAs('u-3')
    await api.chat.join('c-general').catch(() => {})
    await api.chat.leave('c-general')
    const left = (await db.read()).messages.filter((m) => m.channelId === 'c-general' && m.system).at(-1)!
    await expect(api.chat.edit({ kind: 'message', id: left.id }, 'x')).rejects.toMatchObject({ status: 400 })
    await expect(api.chat.remove({ kind: 'message', id: left.id })).rejects.toMatchObject({ status: 400 })
  })
})

describe('thread summary (spec §7: reply_user_ids, latest 5)', () => {
  it('a message with replies says who replied, newest first, each once, at most 5', async () => {
    const root = await api.chat.send('c-general', 'Thread root')
    for (const [who, n] of [['u-2', 1], ['u-3', 1], ['u-2', 1], ['u-4', 1], ['u-5', 1], ['u-6', 1], ['u-7', 1]] as const) {
      await api.users.viewAs(who)
      for (let i = 0; i < n; i++) await api.chat.reply(root.id, `from ${who}`)
    }
    await api.users.viewAs('u-1')
    expect((await api.chat.message(root.id)).replyUserIds).toEqual(['u-7', 'u-6', 'u-5', 'u-4', 'u-2'])
    const page = await api.chat.messages('c-general')
    expect(page.items.find((m) => m.id === root.id)?.replyUserIds).toEqual(['u-7', 'u-6', 'u-5', 'u-4', 'u-2'])
  })

  it('a message without replies has none', async () => {
    const root = await api.chat.send('c-general', 'Alone')
    expect((await api.chat.message(root.id)).replyUserIds).toEqual([])
  })
})

describe('sending a body from the composer, and drafts (spec 6.8, §7)', () => {
  const body = (md: string) => parseBody(md)

  it('send with a body stores it; content is its plain text; mentions and keys come from it', async () => {
    const b = body('Ping @[Nour](u-2) about __ NEX-103')
    if (b[0].type === 'p') b[0].children.push({ type: 'text', text: ' now', marks: ['u'] })
    const sent = await api.chat.send('c-backend', 'ignored', undefined, b)
    expect(sent.body).toEqual(b)
    expect(sent.content).toBe('Ping @Nour about __ NEX-103 now')
    expect(sent.mentions).toEqual([{ kind: 'user', id: 'u-2' }, { kind: 'task', id: 'NEX-103' }])
    expect(sent.linkedTicketKeys).toEqual(['NEX-103'])
  })

  it('a body that is not one, or is empty, is refused', async () => {
    await expect(api.chat.send('c-backend', 'x', undefined, [{ type: 'p', children: [{ type: 'link', href: 'javascript:x', text: 'x' }] }] as never)).rejects.toMatchObject({ status: 400, detail: "That message couldn’t be read." })
    await expect(api.chat.send('c-backend', '', undefined, body('   '))).rejects.toMatchObject({ status: 400, detail: 'Write a message first.' })
  })

  it('a message can be 40,000 characters, not more (spec 6.8)', async () => {
    await expect(api.chat.send('c-general', 'x'.repeat(40_000))).resolves.toBeTruthy()
    await expect(api.chat.send('c-general', 'x'.repeat(40_001))).rejects.toMatchObject({ detail: 'Keep the message under 40000 characters.' })
  })

  it('saves one draft per channel and thread, lists mine, and says so to my tabs', async () => {
    events.length = 0
    const saved = await api.chat.saveDraft('c-backend', body('half a thought'))
    expect(saved).toMatchObject({ channelId: 'c-backend', rootId: null, body: body('half a thought') })
    await api.chat.saveDraft('c-backend', body('changed my mind'))
    await api.chat.saveDraft('c-backend', body('in the thread'), 'm-b07')
    const mine = await api.chat.drafts('ws-eng')
    expect(mine.map((d) => [d.channelId, d.rootId, bodyText(d.body)])).toEqual([
      ['c-backend', null, 'changed my mind'],
      ['c-backend', 'm-b07', 'in the thread'],
    ])
    expect(events.filter((e) => e.type === 'draftChanged')).toHaveLength(3)
    expect(events[0]).toEqual({ type: 'draftChanged', userId: 'u-1', channelId: 'c-backend' })
  })

  it('an empty draft is no draft; drafts are mine alone', async () => {
    await api.chat.saveDraft('c-backend', body('x'))
    expect(await api.chat.saveDraft('c-backend', [])).toBeNull()
    expect(await api.chat.drafts('ws-eng')).toEqual([])
    await api.chat.saveDraft('c-general', body('mine'))
    await api.users.viewAs('u-2')
    expect(await api.chat.drafts('ws-eng')).toEqual([])
  })

  it('a draft in a channel I cannot read is refused', async () => {
    await api.users.viewAs('u-3')
    await expect(api.chat.saveDraft('c-release', body('x'))).rejects.toMatchObject({ status: 403 })
  })
})

describe('delete with Undo, admin delete, edit with a body (spec 6.3, §8 restore)', () => {
  const target = (m: { id: string }) => ({ kind: 'message' as const, id: m.id })

  it('a deleted message shows nothing of itself; restore brings all of it back and says so', async () => {
    const sent = await api.chat.send('c-backend', 'Ship *NEX-103* @[Nour](u-2)')
    await api.chat.react(target(sent), '👍', true)
    await api.chat.remove(target(sent))
    const gone = await api.chat.message(sent.id)
    expect(gone).toMatchObject({ content: '', body: [], mentions: [], reactions: [], linkedTicketKeys: [] })
    expect(gone.deletedAt).toBeTruthy()
    events.length = 0
    await api.chat.restore(target(sent))
    const back = await api.chat.message(sent.id)
    expect(back).toMatchObject({ content: sent.content, body: sent.body, mentions: sent.mentions, linkedTicketKeys: ['NEX-103'], reactions: [{ emoji: '👍', userIds: ['u-1'] }] })
    expect(back.deletedAt ?? null).toBeNull()
    expect(events).toEqual([{ type: 'messageChanged', channelId: 'c-backend', messageId: sent.id }])
  })

  it('a reply can be restored too', async () => {
    const root = await api.chat.send('c-backend', 'root')
    const reply = await api.chat.reply(root.id, 'oops')
    await api.chat.remove({ kind: 'reply', id: reply.id })
    await api.chat.restore({ kind: 'reply', id: reply.id })
    expect((await api.chat.replies(root.id))[0]).toMatchObject({ content: 'oops' })
  })

  it('restore is refused once the window has passed, by someone else, or for a message that is not deleted', async () => {
    const sent = await api.chat.send('c-backend', 'gone for good')
    await expect(api.chat.restore(target(sent))).rejects.toMatchObject({ status: 400, detail: "This message isn’t deleted." })
    await api.chat.remove(target(sent))
    await api.users.viewAs('u-2')
    await expect(api.chat.restore(target(sent))).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-1')
    await db.update((d) => {
      for (const t of d.trash) t.at = new Date(Date.now() - 60_000).toISOString()
    })
    await expect(api.chat.restore(target(sent))).rejects.toMatchObject({ status: 400, detail: "It’s too late to undo that." })
  })

  it('an admin may delete anyone’s message (not edit it); others only their own (spec §9)', async () => {
    await api.users.viewAs('u-2')
    const theirs = await api.chat.send('c-general', 'from Nour')
    await api.users.viewAs('u-3')
    await expect(api.chat.remove(target(theirs))).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-1') // Admin
    await expect(api.chat.edit(target(theirs), 'changed')).rejects.toMatchObject({ status: 403 })
    await api.chat.remove(target(theirs))
    expect((await api.chat.message(theirs.id)).deletedAt).toBeTruthy()
  })

  it('edit with a body stores it, with its plain text and mentions', async () => {
    const sent = await api.chat.send('c-backend', 'first')
    const body = parseBody('*second* @[Nour](u-2)')
    const edited = await api.chat.edit(target(sent), 'ignored', body)
    expect(edited).toMatchObject({ body, content: 'second @Nour', mentions: [{ kind: 'user', id: 'u-2' }] })
    expect(edited.editedAt).toBeTruthy()
    await expect(api.chat.edit(target(sent), '', [{ type: 'p', children: [{ type: 'link', href: 'javascript:x', text: 'x' }] }] as never)).rejects.toMatchObject({ status: 400 })
  })
})

describe('following a thread (spec 6.7)', () => {
  const following = async (id: string) => (await api.chat.message(id)).following

  it('the author follows their message; someone else doesn’t, until they reply', async () => {
    const root = await api.chat.send('c-general', 'Release notes for 2.4?')
    expect(await following(root.id)).toBe(true)
    await api.users.viewAs('u-2')
    expect(await following(root.id)).toBe(false)
    await api.chat.reply(root.id, 'On it')
    expect(await following(root.id)).toBe(true)
  })

  it('a mention by name, in the message or a reply, follows; @all doesn’t', async () => {
    const named = await api.chat.send('c-general', 'Can you check this, @[Nour El-Sayed](u-2)?')
    const everyone = await api.chat.send('c-general', '@all standup moved to 10:00')
    const later = await api.chat.send('c-general', 'Who owns the build?')
    await api.chat.reply(later.id, 'Asking @[Mariam Fathy](u-3)')
    await api.users.viewAs('u-2')
    expect(await following(named.id)).toBe(true)
    expect(await following(everyone.id)).toBe(false)
    await api.users.viewAs('u-3')
    expect(await following(later.id)).toBe(true)
  })

  it('my choice wins over the default, both ways', async () => {
    const root = await api.chat.send('c-general', 'Mine')
    await api.chat.setFollowing(root.id, false)
    expect(await following(root.id)).toBe(false)
    await api.chat.setFollowing(root.id, true)
    expect(await following(root.id)).toBe(true)
    await api.users.viewAs('u-2')
    await api.chat.setFollowing(root.id, true)
    expect(await following(root.id)).toBe(true)
  })

  it('replying, or a new mention, follows again after I turned it off', async () => {
    const root = await api.chat.send('c-general', 'Mine')
    await api.chat.setFollowing(root.id, false)
    await api.chat.reply(root.id, 'One more thing')
    expect(await following(root.id)).toBe(true)
    await api.users.viewAs('u-2')
    await api.chat.setFollowing(root.id, false)
    await api.users.viewAs('u-1')
    await api.chat.reply(root.id, 'Thoughts, @[Nour El-Sayed](u-2)?')
    await api.users.viewAs('u-2')
    expect(await following(root.id)).toBe(true)
  })

  it('the list and the thread’s replies say so too, and the change is published', async () => {
    const root = await api.chat.send('c-general', 'Mine')
    events = []
    await api.chat.setFollowing(root.id, false)
    const page = await api.chat.messages('c-general')
    expect(page.items.find((m) => m.id === root.id)?.following).toBe(false)
    expect(events).toContainEqual({ type: 'messageChanged', channelId: 'c-general', messageId: root.id })
  })

  it('only a message that exists, in a channel I can read', async () => {
    await expect(api.chat.setFollowing('m-nope', true)).rejects.toMatchObject({ status: 404 })
    await api.users.viewAs('u-3') // Mariam: not in #release-v2
    await expect(api.chat.setFollowing('m-r01', true)).rejects.toMatchObject({ status: 403 })
  })
})

describe('muting a thread (spec 6.6 thread ⋮, slice AA)', () => {
  const muted = async (id: string) => (await api.chat.message(id)).threadMuted
  const threadItems = async (rootId: string) => (await api.inbox.list('ws-eng')).filter((i) => i.kind === 'thread' && i.messageId === rootId)

  it('a muted thread stays followed and in Threads, but its replies don’t reach Activity or count as new; a mention still does', async () => {
    const root = await api.chat.send('c-general', 'Release plan for 2.4')
    await api.chat.setThreadMuted(root.id, true)
    expect(await muted(root.id)).toBe(true)
    expect((await api.chat.message(root.id)).following).toBe(true)
    await api.users.viewAs('u-2')
    await api.chat.reply(root.id, 'Looks fine')
    await api.users.viewAs('u-1')
    expect(await threadItems(root.id)).toEqual([])
    const card = (await api.threads.list('ws-eng')).items.find((c) => c.root.id === root.id)!
    expect(card).toMatchObject({ muted: true, unreadCount: 0 })
    await api.users.viewAs('u-2')
    await api.chat.reply(root.id, 'One question for @[Youssef Abdelrahman](u-1)')
    await api.users.viewAs('u-1')
    expect((await api.threads.list('ws-eng')).items.find((c) => c.root.id === root.id)!.unreadCount).toBe(1)
  })

  it('replying keeps it muted; unmuting brings replies back', async () => {
    const root = await api.chat.send('c-general', 'Mine')
    await api.chat.setThreadMuted(root.id, true)
    await api.chat.reply(root.id, 'A note to self')
    expect(await muted(root.id)).toBe(true)
    await api.chat.setThreadMuted(root.id, false)
    await api.users.viewAs('u-2')
    await api.chat.reply(root.id, 'Back')
    await api.users.viewAs('u-1')
    expect(await threadItems(root.id)).toHaveLength(1)
  })

  it('only my own, on a message I can read; the change is published', async () => {
    const root = await api.chat.send('c-general', 'Mine')
    events = []
    await api.chat.setThreadMuted(root.id, true)
    expect(events).toContainEqual({ type: 'messageChanged', channelId: 'c-general', messageId: root.id })
    await api.users.viewAs('u-2')
    expect(await muted(root.id)).toBe(false)
    await expect(api.chat.setThreadMuted('m-nope', true)).rejects.toMatchObject({ status: 404 })
  })
})

describe('Also send to #channel: a broadcast reply (spec 6.7)', () => {
  const listed = async (channelId: string, id: string) => (await api.chat.messages(channelId)).items.find((m) => m.id === id)

  it('takes the channel’s next seq and shows there as a reply to the thread, with its root’s first line', async () => {
    const root = await api.chat.send('c-general', 'Release notes for 2.4?\nDraft is in the doc.')
    const reply = await api.chat.reply(root.id, 'Posted them', undefined, true)
    expect(reply).toMatchObject({ alsoInChannel: true, seq: root.seq + 1 })
    expect(await listed('c-general', reply.id)).toMatchObject({ seq: root.seq + 1, content: 'Posted them', senderId: 'u-1', broadcast: { rootId: root.id, rootText: 'Release notes for 2.4?' } })
    expect((await api.chat.replies(root.id)).map((r) => r.id)).toContain(reply.id)
    expect((await api.chat.channel('c-general')).lastSeq).toBe(root.seq + 1)
  })

  it('a plain reply takes no seq and stays in its thread', async () => {
    const root = await api.chat.send('c-general', 'Question')
    const reply = await api.chat.reply(root.id, 'Answer')
    expect(reply.seq).toBeUndefined()
    expect(await listed('c-general', reply.id)).toBeUndefined()
  })

  it('counts as unread for the others, like any message', async () => {
    const root = await api.chat.send('c-general', 'Question')
    await api.users.viewAs('u-2')
    await api.chat.markRead('c-general')
    await api.users.viewAs('u-1')
    await api.chat.reply(root.id, 'Answer for everyone', undefined, true)
    await api.users.viewAs('u-2')
    expect((await api.chat.channel('c-general')).unreadCount).toBe(1)
  })

  it('is one record: an edit, a reaction or a delete of the reply shows in the channel too', async () => {
    const root = await api.chat.send('c-general', 'Question')
    const reply = await api.chat.reply(root.id, 'Answer', undefined, true)
    await api.chat.edit({ kind: 'reply', id: reply.id }, 'Better answer')
    await api.chat.react({ kind: 'reply', id: reply.id }, '👍', true)
    expect(await listed('c-general', reply.id)).toMatchObject({ content: 'Better answer', reactions: [{ emoji: '👍', userIds: ['u-1'] }] })
    expect((await listed('c-general', reply.id))?.editedAt).toBeTruthy()
    await api.chat.remove({ kind: 'reply', id: reply.id })
    expect((await listed('c-general', reply.id))?.deletedAt).toBeTruthy()
  })

  it('from the rich composer: its body, and the mentions in it', async () => {
    const root = await api.chat.send('c-general', 'Question')
    const body = parseBody('Thoughts, @[Nour El-Sayed](u-2)?')
    const reply = await api.chat.reply(root.id, 'ignored', body, true)
    expect(reply.content).toBe(bodyText(body))
    expect(reply.mentions).toEqual([{ kind: 'user', id: 'u-2' }])
    expect((await listed('c-general', reply.id))?.mentions).toEqual([{ kind: 'user', id: 'u-2' }])
  })

  it('threads are one level: a broadcast reply in the channel takes no replies and no following', async () => {
    const root = await api.chat.send('c-general', 'Question')
    const reply = await api.chat.reply(root.id, 'Answer', undefined, true)
    await expect(api.chat.reply(reply.id, 'Nested')).rejects.toMatchObject({ status: 400 })
    await expect(api.chat.setFollowing(reply.id, true)).rejects.toMatchObject({ status: 400 })
  })

  it('the live event says so', async () => {
    const root = await api.chat.send('c-general', 'Question')
    events = []
    const reply = await api.chat.reply(root.id, 'Answer', undefined, true)
    expect(events).toContainEqual({ type: 'replyReceived', reply: expect.objectContaining({ id: reply.id, alsoInChannel: true }) })
  })
})

