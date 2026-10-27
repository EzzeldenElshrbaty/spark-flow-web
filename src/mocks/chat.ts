import { can } from '@/lib/permissions'
import type { Api, Attachment, Channel, ChannelMemberState, ChatMessage, SystemEvent, ChatTarget, StoredChannel, ThreadReply } from '@/api/types'
import { channelFormErrors } from '@/lib/channelForm'
import { REACTIONS } from '@/lib/reactions'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { ApiError } from '@/lib/apiError'
import { badRequest, clone, currentUser, newId, notFound, requireCan, stamp } from './shared'
import { parseMentions, parseTicketKeys } from './text'
import { parseBody } from '@/lib/messageBody'
import { linkPreviewFor } from './linkPreviews'

const PAGE_SIZE = 30

/** The cursor is the seq of the last message on the previous page: unique per channel, so pages never overlap. */
const encodeCursor = (m: Pick<ChatMessage, 'seq'>) => String(m.seq)

/** A cursor that doesn't parse reads as the start of the list, like any unknown cursor would. */
function decodeCursor(cursor: string): number | null {
  const seq = Number(cursor)
  return Number.isInteger(seq) && seq > 0 ? seq : null
}

const freshState = (): ChannelMemberState => ({ lastReadSeq: 0, starred: false, muted: false, notifyLevel: 'all' })

/** The current user's own state in a channel, created with the defaults when first needed. */
function myState(data: DbData, channelId: string): ChannelMemberState {
  const mine = (data.channelState[data.currentUserId] ??= {})
  return (mine[channelId] ??= freshState())
}

/** The seq of a channel's newest message; 0 when it has none. */
const lastSeqOf = (data: DbData, channelId: string) => data.messages.reduce((n, m) => (m.channelId === channelId && m.seq > n ? m.seq : n), 0)

/**
 * The channel as the current user sees it: their own state, and their unread count (messages past their read marker
 * that someone else sent, not deleted).
 */
function withUnread(data: DbData, channel: StoredChannel): Channel {
  const state = data.channelState[data.currentUserId]?.[channel.id] ?? freshState()
  const unreadCount = data.messages.filter(
    (m) => m.channelId === channel.id && m.seq > state.lastReadSeq && m.senderId !== data.currentUserId && !m.deletedAt && !m.system,
  ).length
  return { ...channel, ...state, lastSeq: lastSeqOf(data, channel.id), unreadCount }
}

const REPLY_FACES = 5

/** A message with who last replied to it (spec §7 reply_user_ids): the latest 5 people, newest first, each once. */
function withThread(data: DbData, message: ChatMessage): ChatMessage {
  const replies = data.replies.filter((r) => r.messageId === message.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return { ...message, replyUserIds: [...new Set(replies.map((r) => r.senderId))].slice(0, REPLY_FACES) }
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

const notInChannel = () => new ApiError({ title: 'Forbidden', status: 403, detail: "You're not in this channel." })

/** Private channels and DMs exist only for their members; everyone in the workspace sees the rest. */
const visible = (data: DbData, channel: StoredChannel) => !channel.isPrivate || channel.memberIds.includes(data.currentUserId)

/** A channel I may read: unknown is 404, someone else's private channel is 403. */
function readableChannel(data: DbData, id: string): StoredChannel {
  const channel = findChannel(data, id)
  if (!visible(data, channel)) throw notInChannel()
  return channel
}

/** Who may change a channel (spec §4.3, channel.manage): its members, or an Admin for a public one. */
function requireManage(data: DbData, channel: StoredChannel) {
  const me = currentUser(data)
  if (!can('channel.manage', { userId: me.id, role: me.role, channel })) throw new ApiError({ title: 'Forbidden', status: 403, detail: 'Only its members can change this channel.' })
  return me
}

/** The first rule a channel's values break, as the 400 the form would show; names are unique in the workspace. */
function checkChannel(data: DbData, values: { workspaceId: string; id?: string; name: string; topic: string; isPrivate: boolean; others: string[] }) {
  const taken = data.channels.filter((c) => c.workspaceId === values.workspaceId && c.id !== values.id && c.name).map((c) => c.name!)
  const errors = channelFormErrors({ name: values.name, topic: values.topic, isPrivate: values.isPrivate, memberIds: values.others }, taken)
  const first = errors.name ?? errors.topic ?? errors.members
  if (first) throw badRequest(first)
  const unknown = values.others.find((id) => !data.users.some((u) => u.id === id))
  if (unknown) throw notFound('User', unknown)
}

const MAX_TEXT = 4000
const MAX_DM_OTHERS = 8

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
  if (channel.archivedAt) throw badRequest('This channel is archived.')
  const project = data.projects.find((p) => p.channelId === channel.id)
  if (project) return requireCan(data, 'collab.post', project)
  const me = requireCan(data, 'collab.post')
  if (channel.isPrivate && !channel.memberIds.includes(me.id)) throw notInChannel()
  return me
}

type Row = ChatMessage | ThreadReply

/** The message or reply an action is about, its channel, and the message whose thread it is (itself for a message). */
function findTarget(data: DbData, target: ChatTarget): { row: Row; channel: StoredChannel; messageId: string } {
  if (target.kind === 'message') {
    const row = findMessage(data, target.id)
    return { row, channel: findChannel(data, row.channelId), messageId: row.id }
  }
  const row = data.replies.find((r) => r.id === target.id)
  if (!row) throw notFound('Reply', target.id)
  return { row, channel: findChannel(data, row.channelId), messageId: row.messageId }
}

const forbiddenOwn = () => new ApiError({ title: 'Forbidden', status: 403, detail: 'You can only change your own messages.' })

/** Cards (a comment's, a task event's), system messages and deleted rows stay as they are. */
function checkPlain(row: Row) {
  if (row.deletedAt || ('commentId' in row && row.commentId) || ('taskEvent' in row && row.taskEvent) || ('system' in row && row.system)) throw badRequest("This message can't be changed.")
}

/** Keys of tasks someone made from this message: an edit keeps them linked even when the text no longer says them. */
const keysMadeFrom = (data: DbData, messageId: string) => data.tickets.filter((t) => t.linkedMessageId === messageId).map((t) => t.key)

export function chatApi(db: MockDb, hub: MockHub): Api['chat'] {
  /** Joins or leaves a channel as the current user. A project's channel follows its people; a DM keeps its own. */
  const setMember = async (id: string, join: boolean) => {
    await delay()
    const { channel, posted } = await db.update((data) => {
      const channel = findChannel(data, id)
      const me = currentUser(data)
      const wasMember = channel.memberIds.includes(me.id)
      if (channel.kind === 'dm') throw badRequest(join ? 'You can only join public channels.' : "You can't leave a conversation.")
      if (data.projects.some((p) => p.channelId === id)) throw badRequest('This channel follows its project.')
      if (join) {
        if (channel.isPrivate) throw badRequest('You can only join public channels.')
        if (channel.archivedAt) throw badRequest('This channel is archived.')
        if (!channel.memberIds.includes(me.id)) channel.memberIds.push(me.id)
      } else {
        channel.memberIds = channel.memberIds.filter((m) => m !== me.id)
      }
      // Only a real change says so in the channel.
      const posted = wasMember === join ? [] : [postSystem(data, channel.id, { kind: join ? 'joined' : 'left' })]
      return { channel: withUnread(data, channel), posted }
    })
    for (const message of posted) hub.publish({ type: 'messageReceived', message: clone(message) })
    hub.publish({ type: 'channelChanged', channelId: id })
    return clone(channel)
  }
  /** Archives or restores a channel: its members and admins; a project's channel follows its project, a DM never is. */
  const setArchived = async (id: string, archive: boolean) => {
    await delay()
    const result = await db.update((data) => {
      const channel = readableChannel(data, id)
      if (channel.kind === 'dm') throw badRequest("Conversations can't be archived.")
      if (data.projects.some((p) => p.channelId === id)) throw badRequest('This channel follows its project.')
      requireManage(data, channel)
      // Already so: nothing changes and nothing is sent.
      if (Boolean(channel.archivedAt) === archive) return { channel: withUnread(data, channel), same: true }
      channel.archivedAt = archive ? new Date().toISOString() : null
      return { channel: withUnread(data, channel), same: false }
    })
    if (result.same) return clone(result.channel)
    const channel = result.channel
    hub.publish({ type: 'channelChanged', channelId: id })
    return clone(channel)
  }
  const changed = (channelId: string, messageId: string) => hub.publish({ type: 'messageChanged', channelId, messageId })
  /** Sets one of my own flags on a channel I can read; only I am told (my other tabs follow). */
  const setMine = async (id: string, patch: Partial<Pick<ChannelMemberState, 'starred' | 'muted'>>) => {
    await delay()
    const result = await db.update((data) => {
      const channel = readableChannel(data, id)
      Object.assign(myState(data, id), patch)
      return { channel: withUnread(data, channel), userId: data.currentUserId }
    })
    hub.publish({ type: 'readChanged', userId: result.userId, channelId: id })
    return clone(result.channel)
  }
  return {
    async openDm(workspaceId, userIds) {
      await delay()
      const { channel, created } = await db.update((data) => {
        if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
        const me = currentUser(data)
        const others = [...new Set(userIds)].filter((id) => id !== me.id)
        if (others.length === 0) throw badRequest('Pick at least one person.')
        if (others.length > MAX_DM_OTHERS) throw badRequest(`A conversation can have up to ${MAX_DM_OTHERS + 1} people.`)
        const unknown = others.find((id) => !data.users.some((u) => u.id === id))
        if (unknown) throw notFound('User', unknown)
        // The same people (in any order) always get the same conversation.
        const members = [me.id, ...others].sort()
        const same = data.channels.find(
          (c) => c.workspaceId === workspaceId && c.kind === 'dm' && c.memberIds.length === members.length && [...c.memberIds].sort().every((id, i) => id === members[i]),
        )
        if (same) return { channel: withUnread(data, same), created: false }
        const dm: StoredChannel = { id: newId('c'), workspaceId, kind: 'dm', name: null, topic: '', memberIds: [me.id, ...others], isPrivate: true, lastMessageAt: null }
        data.channels.push(dm)
        return { channel: withUnread(data, dm), created: true }
      })
      if (created) hub.publish({ type: 'channelChanged', channelId: channel.id })
      return clone(channel)
    },
    async createChannel(input) {
      await delay()
      const channel = await db.update((data) => {
        if (!data.workspaces.some((w) => w.id === input.workspaceId)) throw notFound('Workspace', input.workspaceId)
        const me = currentUser(data)
        const name = input.name.trim()
        const topic = input.topic.trim()
        const others = [...new Set(input.memberIds)].filter((id) => id !== me.id)
        checkChannel(data, { workspaceId: input.workspaceId, name, topic, isPrivate: input.isPrivate, others })
        const created: StoredChannel = { id: newId('c'), workspaceId: input.workspaceId, kind: 'channel', name, topic, memberIds: [me.id, ...others], isPrivate: input.isPrivate, lastMessageAt: null }
        data.channels.push(created)
        return withUnread(data, created)
      })
      hub.publish({ type: 'channelChanged', channelId: channel.id })
      return clone(channel)
    },
    async updateChannel(id, patch) {
      await delay()
      const { channel, posted } = await db.update((data) => {
        const channel = readableChannel(data, id)
        if (channel.kind === 'dm') throw badRequest("Direct messages can't be edited.")
        if (data.projects.some((p) => p.channelId === id)) throw badRequest('This channel follows its project.')
        const me = requireManage(data, channel)
        const member = channel.memberIds.includes(me.id)
        const memberIds = patch.memberIds ? [...new Set(patch.memberIds)] : channel.memberIds
        if (member && !memberIds.includes(me.id)) throw badRequest("You can't remove yourself.")
        const name = (patch.name ?? channel.name ?? '').trim()
        const topic = (patch.topic ?? channel.topic).trim()
        checkChannel(data, { workspaceId: channel.workspaceId, id, name, topic, isPrivate: channel.isPrivate, others: memberIds.filter((m) => m !== me.id) })
        const posted: ChatMessage[] = []
        if (channel.name && name !== channel.name) posted.push(postSystem(data, id, { kind: 'renamed', from: channel.name, to: name }))
        if (topic !== channel.topic) posted.push(postSystem(data, id, { kind: 'topic', to: topic }))
        Object.assign(channel, { name, topic, memberIds })
        return { channel: withUnread(data, channel), posted }
      })
      for (const message of posted) hub.publish({ type: 'messageReceived', message: clone(message) })
      hub.publish({ type: 'channelChanged', channelId: id })
      return clone(channel)
    },
    join: (id) => setMember(id, true),
    leave: (id) => setMember(id, false),
    archiveChannel: (id) => setArchived(id, true),
    restoreChannel: (id) => setArchived(id, false),
    async react(target, emoji) {
      await delay()
      if (!(REACTIONS as readonly string[]).includes(emoji)) throw badRequest('Pick one of the reactions shown.')
      const { channelId, messageId } = await db.update((data) => {
        const { row, channel, messageId } = findTarget(data, target)
        const me = checkCanPost(data, channel)
        if (row.deletedAt) throw badRequest("This message can't be changed.")
        const reaction = row.reactions.find((r) => r.emoji === emoji)
        if (!reaction) row.reactions.push({ emoji, userIds: [me.id] })
        else if (reaction.userIds.includes(me.id)) reaction.userIds = reaction.userIds.filter((id) => id !== me.id)
        else reaction.userIds.push(me.id)
        row.reactions = row.reactions.filter((r) => r.userIds.length > 0)
        return { channelId: channel.id, messageId }
      })
      changed(channelId, messageId)
    },
    async edit(target, content) {
      await delay()
      const text = checkText(content)
      const result = await db.update((data) => {
        const { row, channel, messageId } = findTarget(data, target)
        const me = checkCanPost(data, channel)
        if (row.senderId !== me.id) throw forbiddenOwn()
        checkPlain(row)
        if (row.content === text) return { row: clone(row), channelId: channel.id, messageId, same: true }
        row.content = text
        row.body = parseBody(text)
        row.mentions = parseMentions(text)
        row.editedAt = new Date().toISOString()
        if (target.kind === 'message') {
          const message = row as ChatMessage
          message.linkedTicketKeys = [...new Set([...parseTicketKeys(text), ...keysMadeFrom(data, message.id)])]
        }
        return { row: clone(row), channelId: channel.id, messageId, same: false }
      })
      if (!result.same) changed(result.channelId, result.messageId)
      return result.row
    },
    async remove(target) {
      await delay()
      const { channelId, messageId } = await db.update((data) => {
        const { row, channel, messageId } = findTarget(data, target)
        const me = checkCanPost(data, channel)
        if (row.senderId !== me.id) throw forbiddenOwn()
        checkPlain(row)
        row.content = ''
        row.body = []
        row.attachments = []
        row.mentions = []
        row.reactions = []
        row.deletedAt = new Date().toISOString()
        if (target.kind === 'message') (row as ChatMessage).linkedTicketKeys = []
        return { channelId: channel.id, messageId }
      })
      changed(channelId, messageId)
    },
    async send(channelId, content, clientId) {
      await delay()
      const { message, repeat } = await db.update((data) => {
        const channel = findChannel(data, channelId)
        const me = checkCanPost(data, channel)
        // A retry of a send that did arrive gets the message it stored, not a second one (spec §8: writes are idempotent).
        const stored = clientId ? data.messages.find((m) => m.channelId === channelId && m.senderId === me.id && m.clientId === clientId) : undefined
        if (stored) return { message: stored, repeat: true }
        return { message: postMessage(data, { channelId, content: checkText(content), clientId }), repeat: false }
      })
      if (!repeat) hub.publish({ type: 'messageReceived', message: clone(message) })
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
      return data.channels.filter((c) => c.workspaceId === workspaceId && visible(data, c)).map((c) => withUnread(data, c))
    },
    async channel(id) {
      await delay()
      const data = await db.read()
      return withUnread(data, readableChannel(data, id))
    },
    async messages(channelId, cursor) {
      await delay()
      const data = await db.read()
      readableChannel(data, channelId)
      // Newest first, by seq (spec §8: ordering is per channel, by seq). The cursor is opaque to clients.
      const before = cursor === undefined ? null : decodeCursor(cursor)
      const older = data.messages
        .filter((m) => m.channelId === channelId && (before === null || m.seq < before))
        .sort((a, b) => b.seq - a.seq)
      const items = older.slice(0, PAGE_SIZE)
      return { items: items.map((m) => withThread(data, m)), nextCursor: older.length > PAGE_SIZE ? encodeCursor(items[items.length - 1]) : null }
    },
    async messagesAfter(channelId, cursor) {
      await delay()
      const data = await db.read()
      readableChannel(data, channelId)
      const after = decodeCursor(cursor) ?? 0
      const newer = data.messages.filter((m) => m.channelId === channelId && m.seq > after).sort((a, b) => a.seq - b.seq)
      const page = newer.slice(0, PAGE_SIZE)
      // Newest first, like every page; the cursor is the newest message here, to go on from.
      return { items: [...page].reverse().map((m) => withThread(data, m)), nextCursor: newer.length > PAGE_SIZE ? encodeCursor(page[page.length - 1]) : null }
    },
    async linkPreview(url) {
      await delay()
      return linkPreviewFor(url)
    },
    async jumpTarget(channelId, since) {
      await delay()
      const data = await db.read()
      readableChannel(data, channelId)
      const first = data.messages
        .filter((m) => m.channelId === channelId && (since === null || m.createdAt >= since))
        .reduce<ChatMessage | null>((best, m) => (!best || m.seq < best.seq ? m : best), null)
      return first?.seq ?? null
    },
    async message(id) {
      await delay()
      const data = await db.read()
      const message = findMessage(data, id)
      readableChannel(data, message.channelId)
      return withThread(data, message)
    },
    async replies(messageId) {
      await delay()
      const data = await db.read()
      readableChannel(data, findMessage(data, messageId).channelId)
      return data.replies.filter((r) => r.messageId === messageId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    },
    async markRead(channelId, seq) {
      await delay()
      const result = await db.update((data) => {
        readableChannel(data, channelId)
        const last = lastSeqOf(data, channelId)
        const state = myState(data, channelId)
        state.lastReadSeq = Math.max(state.lastReadSeq, Math.min(seq ?? last, last))
        return { userId: data.currentUserId, seq: state.lastReadSeq }
      })
      hub.publish({ type: 'readChanged', userId: result.userId, channelId, seq: result.seq })
    },
    setStarred: (id, starred) => setMine(id, { starred }),
    setMuted: (id, muted) => setMine(id, { muted }),
  }
}

// ── Mutations (not on Api until Phases 3–4) ───────────────────────────────

export type SendMessageInput = { channelId: string; content: string; attachments?: Attachment[]; clientId?: string }
export type AddReplyInput = { messageId: string; content: string }

/**
 * Adds a message from the current user inside a transaction; mentions and ticket keys come from the text. `extra`
 * carries what only some messages have (the comment a card stands for).
 */
export function postMessage(data: DbData, input: SendMessageInput, extra: Partial<Pick<ChatMessage, 'commentId' | 'taskEvent' | 'system'>> = {}): ChatMessage {
  const channel = findChannel(data, input.channelId)
  const lastInChannel = data.messages.reduce((t, m) => (m.channelId === channel.id && m.createdAt > t ? m.createdAt : t), '')
  const createdAt = stamp(lastInChannel)
  const created: ChatMessage = {
    id: newId('m'),
    channelId: channel.id,
    seq: lastSeqOf(data, channel.id) + 1,
    ...(input.clientId ? { clientId: input.clientId } : {}),
    senderId: data.currentUserId,
    content: input.content,
    attachments: input.attachments ?? [],
    reactions: [],
    threadCount: 0,
    lastReplyAt: null,
    linkedTicketKeys: parseTicketKeys(input.content),
    mentions: parseMentions(input.content),
    body: parseBody(input.content),
    editedAt: null,
    createdAt,
    ...extra,
  }
  data.messages.push(created)
  channel.lastMessageAt = createdAt
  return created
}

/** What the channel says about a change the current user made (joined, left, renamed, topic changed). */
function postSystem(data: DbData, channelId: string, event: SystemEvent): ChatMessage {
  return postMessage(data, { channelId, content: '' }, { system: event })
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
    body: parseBody(input.content),
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
