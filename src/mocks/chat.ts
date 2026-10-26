import type { Api, Attachment, Channel, ChatMessage, StoredChannel, ThreadReply } from '@/api/types'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { clone, newId, notFound, stamp } from './shared'
import { parseTicketKeys } from './text'

const PAGE_SIZE = 30

type SortKey = Pick<ChatMessage, 'createdAt' | 'id'>

/** Newest first; ties on createdAt fall back to id, so the order is total. */
const compareDesc = (a: SortKey, b: SortKey) =>
  a.createdAt === b.createdAt ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.createdAt < b.createdAt ? 1 : -1

const encodeCursor = (m: SortKey) => `${m.createdAt}|${m.id}`

/** A cursor that doesn't parse reads as the start of the list, like any unknown cursor would. */
function decodeCursor(cursor: string): SortKey | null {
  const at = cursor.indexOf('|')
  return at < 0 ? null : { createdAt: cursor.slice(0, at), id: cursor.slice(at + 1) }
}

/** The current user's unread count: messages after their read time that someone else sent. */
function withUnread(data: DbData, channel: StoredChannel): Channel {
  const readAt = data.reads[channel.id] ?? ''
  const unreadCount = data.messages.filter(
    (m) => m.channelId === channel.id && m.createdAt > readAt && m.senderId !== data.currentUserId,
  ).length
  return { ...channel, unreadCount }
}

function findChannel(data: DbData, id: string): StoredChannel {
  const channel = data.channels.find((c) => c.id === id)
  if (!channel) throw notFound('Channel', id)
  return channel
}

function findMessage(data: DbData, id: string): ChatMessage {
  const message = data.messages.find((m) => m.id === id)
  if (!message) throw notFound('Message', id)
  return message
}

export function chatApi(db: MockDb): Api['chat'] {
  return {
    async channels(workspaceId) {
      await delay()
      const data = db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      return data.channels.filter((c) => c.workspaceId === workspaceId).map((c) => withUnread(data, c))
    },
    async channel(id) {
      await delay()
      const data = db.read()
      return withUnread(data, findChannel(data, id))
    },
    async messages(channelId, cursor) {
      await delay()
      const data = db.read()
      findChannel(data, channelId)
      // Newest first, by (createdAt, id) descending. The cursor is opaque: the sort key of the last message of the
      // previous page, so messages that share a timestamp across a page boundary are neither dropped nor repeated.
      const before = cursor === undefined ? null : decodeCursor(cursor)
      const older = data.messages
        .filter((m) => m.channelId === channelId && (before === null || compareDesc(before, m) < 0))
        .sort(compareDesc)
      const items = older.slice(0, PAGE_SIZE)
      return { items, nextCursor: older.length > PAGE_SIZE ? encodeCursor(items[items.length - 1]) : null }
    },
    async message(id) {
      await delay()
      return findMessage(db.read(), id)
    },
    async replies(messageId) {
      await delay()
      const data = db.read()
      findMessage(data, messageId)
      return data.replies.filter((r) => r.messageId === messageId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    },
    async markRead(channelId) {
      await delay()
      findChannel(db.read(), channelId)
      db.markRead(channelId, new Date().toISOString()) // its own key: never rewrites the shared document
    },
  }
}

// ── Mutations (not on Api until Phases 3–4) ───────────────────────────────

export type SendMessageInput = { channelId: string; content: string; attachments?: Attachment[] }
export type AddReplyInput = { messageId: string; content: string }

/** Posts a message as the current user, then tells every tab. */
export async function sendMessage(db: MockDb, hub: MockHub, input: SendMessageInput): Promise<ChatMessage> {
  const message = db.update((data) => {
    const channel = findChannel(data, input.channelId)
    const lastInChannel = data.messages.reduce((t, m) => (m.channelId === channel.id && m.createdAt > t ? m.createdAt : t), '')
    const createdAt = stamp(lastInChannel)
    const created: ChatMessage = {
      id: newId('m'),
      channelId: channel.id,
      senderId: data.currentUserId,
      content: input.content,
      attachments: input.attachments ?? [],
      reactions: [],
      threadCount: 0,
      lastReplyAt: null,
      linkedTicketKeys: parseTicketKeys(input.content),
      editedAt: null,
      createdAt,
    }
    data.messages.push(created)
    channel.lastMessageAt = createdAt
    return created
  })
  hub.publish({ type: 'messageReceived', message: clone(message) })
  return message
}

/** Replies in a thread as the current user, then tells every tab. */
export async function addReply(db: MockDb, hub: MockHub, input: AddReplyInput): Promise<ThreadReply> {
  const reply = db.update((data) => {
    const parent = findMessage(data, input.messageId)
    const channel = findChannel(data, parent.channelId)
    const createdAt = stamp(parent.lastReplyAt)
    const created: ThreadReply = {
      id: newId('r'),
      messageId: parent.id,
      channelId: parent.channelId,
      senderId: data.currentUserId,
      content: input.content,
      attachments: [],
      reactions: [],
      createdAt,
    }
    data.replies.push(created)
    parent.threadCount += 1
    parent.lastReplyAt = createdAt
    channel.lastMessageAt = createdAt
    return created
  })
  hub.publish({ type: 'replyReceived', reply: clone(reply) })
  return reply
}
