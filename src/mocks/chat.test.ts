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
    const before = (await db.read()).reads
    const t0 = new Date().toISOString()
    await api.chat.markRead('c-frontend')
    const reads = (await db.read()).reads
    expect(reads['c-frontend'] >= t0).toBe(true) // set to the current time
    expect(reads['c-frontend']).not.toBe(before['c-frontend'])
    expect(reads['c-dm-2']).toBe(before['c-dm-2'])
  })

  it('markRead throws ApiError 404 for an unknown channel', async () => {
    await expect(api.chat.markRead('nope')).rejects.toMatchObject({ status: 404 })
  })

  it('own messages do not count as unread', async () => {
    await db.update((d) => { d.reads['c-backend'] = new Date(Date.now() - 3_600_000).toISOString() }) // read an hour ago
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
