import type { Api, Attachment, Channel, ChatMessage, StoredChannel, ThreadReply } from '@/api/types'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { ApiError } from '@/lib/apiError'
import { badRequest, clone, newId, notFound, requireCan, stamp } from './shared'
import { parseMentions, parseTicketKeys } from './text'

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

const MAX_TEXT = 4000

/** The text as stored: trimmed, not empty, not too long. */
function checkText(content: string): string {
  const text = content.trim()
  if (!text) throw badRequest('Write a message first.')
  if (text.length > MAX_TEXT) throw badRequest(`Keep the message under ${MAX_TEXT} characters.`)
  return text
}

/**
 * Who may write in a channel (spec §4.3, collab.post): a project's channel follows its project; a private channel needs
 * membership; any other channel is open to the workspace.
 */
function checkCanPost(data: DbData, channel: StoredChannel) {
  const project = data.projects.find((p) => p.channelId === channel.id)
  if (project) return requireCan(data, 'collab.post', project)
  const me = requireCan(data, 'collab.post')
  if (channel.isPrivate && !channel.memberIds.includes(me.id)) throw new ApiError({ title: 'Forbidden', status: 403, detail: "You're not in this channel." })
  return me
}

export function chatApi(db: MockDb, hub: MockHub): Api['chat'] {
  return {
    async send(channelId, content) {
      await delay()
      const message = await db.update((data) => {
        const channel = findChannel(data, channelId)
        checkCanPost(data, channel)
        return postMessage(data, { channelId, content: checkText(content) })
      })
      hub.publish({ type: 'messageReceived', message: clone(message) })
      return clone(message)
    },
    async reply(messageId, content) {
      await delay()
      const reply = await db.update((data) => {
        checkCanPost(data, findChannel(data, findMessage(data, messageId).channelId))
        return postReply(data, { messageId, content: checkText(content) })
      })
      hub.publish({ type: 'replyReceived', reply: clone(reply) })
      return clone(reply)
    },
    async channels(workspaceId) {
      await delay()
      const data = await db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      return data.channels.filter((c) => c.workspaceId === workspaceId).map((c) => withUnread(data, c))
    },
    async channel(id) {
      await delay()
      const data = await db.read()
      return withUnread(data, findChannel(data, id))
    },
    async messages(channelId, cursor) {
      await delay()
      const data = await db.read()
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
      return findMessage(await db.read(), id)
    },
    async replies(messageId) {
      await delay()
      const data = await db.read()
      findMessage(data, messageId)
      return data.replies.filter((r) => r.messageId === messageId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    },
    async markRead(channelId) {
      await delay()
      await db.update((data) => {
        findChannel(data, channelId)
        data.reads[channelId] = new Date().toISOString()
      })
    },
  }
}

// ── Mutations (not on Api until Phases 3–4) ───────────────────────────────

export type SendMessageInput = { channelId: string; content: string; attachments?: Attachment[] }
export type AddReplyInput = { messageId: string; content: string }

/**
 * Adds a message from the current user inside a transaction; mentions and ticket keys come from the text. `extra`
 * carries what only some messages have (the comment a card stands for).
 */
export function postMessage(data: DbData, input: SendMessageInput, extra: Partial<Pick<ChatMessage, 'commentId'>> = {}): ChatMessage {
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
    mentions: parseMentions(input.content),
    editedAt: null,
    createdAt,
    ...extra,
  }
  data.messages.push(created)
  channel.lastMessageAt = createdAt
  return created
}

/** Adds a thread reply from the current user inside a transaction. */
export function postReply(data: DbData, input: AddReplyInput): ThreadReply {
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
    mentions: parseMentions(input.content),
    createdAt,
  }
  data.replies.push(created)
  parent.threadCount += 1
  parent.lastReplyAt = createdAt
  channel.lastMessageAt = createdAt
  return created
}

/** Posts a message as the current user without the checks (dev helper and seed tools), then tells every tab. */
export async function sendMessage(db: MockDb, hub: MockHub, input: SendMessageInput): Promise<ChatMessage> {
  const message = await db.update((data) => postMessage(data, input))
  hub.publish({ type: 'messageReceived', message: clone(message) })
  return message
}

/** Replies in a thread as the current user without the checks, then tells every tab. */
export async function addReply(db: MockDb, hub: MockHub, input: AddReplyInput): Promise<ThreadReply> {
  const reply = await db.update((data) => postReply(data, input))
  hub.publish({ type: 'replyReceived', reply: clone(reply) })
  return reply
}
