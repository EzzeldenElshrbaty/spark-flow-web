import { can } from '@/lib/permissions'
import type { Api, Attachment, Channel, ChannelMemberState, ChatMessage, Mention, NotifyLevel, Page, SentItem, SystemEvent, ChatTarget, StoredChannel, ThreadReply, WhoCanPost } from '@/api/types'
import { channelFormErrors, descriptionError } from '@/lib/channelForm'
import { isEmail, MAX_INVITES, normalEmail, notAnEmailLine } from '@/lib/invites'
import { MAX_MESSAGE_FILES } from '@/lib/fileDetails'
import { onlyAdminsLine } from '@/lib/channels'
import { FLOWBOT_READ_ONLY, isFlowbotDm } from '@/lib/flowbot'
import { isOneEmoji } from '@/lib/emojiText'
import { MAX_DISTINCT_REACTIONS, setReaction } from '@/lib/reactions'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { ApiError } from '@/lib/apiError'
import { badRequest, clone, currentUser, newId, notFound, requireCan, stamp } from './shared'
import { parseMentions, parseTicketKeys } from './text'
import { bodyTaskKeys, bodyText, mentionsOf, parseBody, validBody, type Body } from '@/lib/messageBody'
import { linkPreviewFor } from './linkPreviews'
import { firstLine } from '@/lib/inspector'
import { canRead, freshState } from './membership'
import { hereReached, reachedBy } from './mentions'
import { rowText } from './saved'

const PAGE_SIZE = 30

/** The cursor is the seq of the last message on the previous page: unique per channel, so pages never overlap. */
const encodeCursor = (m: Pick<ChatMessage, 'seq'>) => String(m.seq)

/** A cursor that doesn't parse reads as the start of the list, like any unknown cursor would. */
function decodeCursor(cursor: string): number | null {
  const seq = Number(cursor)
  return Number.isInteger(seq) && seq > 0 ? seq : null
}

/** A page of a channel's messages older than `before` (all of them when null), newest first by seq (spec §8). */
function olderPage(data: DbData, channelId: string, before: number | null): Page<ChatMessage> {
  readableChannel(data, channelId)
  const older = data.messages.filter((m) => m.channelId === channelId && (before === null || m.seq < before)).sort((a, b) => b.seq - a.seq)
  const items = older.slice(0, PAGE_SIZE)
  return { items: items.map((m) => withThread(data, m)), nextCursor: older.length > PAGE_SIZE ? encodeCursor(items[items.length - 1]) : null }
}

/** The current user's own state in a channel, created with the defaults when first needed. */
function myState(data: DbData, channelId: string): ChannelMemberState {
  const mine = (data.channelState[data.currentUserId] ??= {})
  return (mine[channelId] ??= freshState(data.channels.find((c) => c.id === channelId)?.kind))
}

const NOTIFY_LEVELS: NotifyLevel[] = ['all', 'mentions', 'none']

/** The seq of a channel's newest message; 0 when it has none. */
const lastSeqOf = (data: DbData, channelId: string) => data.messages.reduce((n, m) => (m.channelId === channelId && m.seq > n ? m.seq : n), 0)

/**
 * The channel as the current user sees it: their own state, and their unread count (messages past their read marker
 * that someone else sent, not deleted).
 */
function withUnread(data: DbData, channel: StoredChannel): Channel {
  const state = data.channelState[data.currentUserId]?.[channel.id] ?? freshState(channel.kind)
  const unreadCount = data.messages
    .filter((m) => m.channelId === channel.id && m.seq > state.lastReadSeq && m.senderId !== data.currentUserId)
    .map((m) => listed(data, m))
    .filter((m) => !m.deletedAt && !m.system).length
  return { ...channel, ...state, lastSeq: lastSeqOf(data, channel.id), unreadCount }
}

const REPLY_FACES = 5

/** Whether a message or reply mentions this person by name (`@all` doesn't make anyone follow). */
const namesUser = (row: ChatMessage | ThreadReply, userId: string) => row.mentions.some((m) => m.kind === 'user' && m.id === userId)

/**
 * Whether this person follows the thread (spec 6.7): their own choice, else the defaults: they wrote the message,
 * replied to it, or were mentioned by name in it or a reply.
 */
function follows(data: DbData, message: ChatMessage, replies: ThreadReply[], userId: string): boolean {
  const choice = data.threadFollows.find((f) => f.userId === userId && f.rootId === message.id)
  if (choice) return choice.following
  return message.senderId === userId || namesUser(message, userId) || replies.some((r) => r.senderId === userId || namesUser(r, userId))
}

/**
 * A message as its channel lists it. A broadcast reply (spec 6.7) is the reply itself: the channel keeps only its place
 * (seq) and its thread's root, and everything else (text, files, reactions, edits, a delete) is read from the reply.
 */
function listed(data: DbData, message: ChatMessage): ChatMessage {
  if (!message.broadcast) return message
  const reply = data.replies.find((r) => r.id === message.id)
  const root = data.messages.find((m) => m.id === message.broadcast?.rootId)
  if (!reply) return message
  return {
    ...message,
    content: reply.content,
    body: reply.body,
    attachments: reply.attachments,
    reactions: reply.reactions,
    mentions: reply.mentions,
    editedAt: reply.editedAt ?? null,
    deletedAt: reply.deletedAt ?? null,
    broadcast: { rootId: message.broadcast.rootId, rootText: root && !root.deletedAt ? firstLine(root.content) : '' },
  }
}

/**
 * A message with who last replied to it (spec §7 reply_user_ids): the latest 5 people, newest first, each once; and
 * whether the current user follows its thread. A broadcast reply has no thread of its own.
 */
function withThread(data: DbData, message: ChatMessage): ChatMessage {
  if (message.broadcast) return listed(data, message)
  const replies = data.replies.filter((r) => r.messageId === message.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return { ...message, replyUserIds: [...new Set(replies.map((r) => r.senderId))].slice(0, REPLY_FACES), following: follows(data, message, replies, data.currentUserId) }
}

export function findChannel(data: DbData, id: string): StoredChannel {
  const channel = data.channels.find((c) => c.id === id)
  if (!channel) throw notFound('Channel', id)
  return channel
}

export function findMessage(data: DbData, id: string): ChatMessage {
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

/**
 * The first rule a channel's values break, as the 400 the form would show; names are unique in the workspace. The
 * people are checked only when given (a new channel): an existing one's change through addMembers and removeMember.
 */
function checkChannel(data: DbData, values: { workspaceId: string; id?: string; name: string; topic: string; isPrivate: boolean; others?: string[] }) {
  const taken = data.channels.filter((c) => c.workspaceId === values.workspaceId && c.id !== values.id && c.name).map((c) => c.name!)
  const errors = channelFormErrors({ name: values.name, topic: values.topic, isPrivate: values.isPrivate, memberIds: values.others ?? [] }, taken)
  const first = errors.name ?? errors.topic ?? (values.others ? errors.members : undefined)
  if (first) throw badRequest(first)
  const unknown = values.others?.find((id) => !data.users.some((u) => u.id === id))
  if (unknown) throw notFound('User', unknown)
}

const MAX_TEXT = 40_000 // spec 6.8
/** How long a delete can be undone (spec 6.3: the toast's 5s, plus time for the request to arrive). */
export const UNDO_MS = 10_000
const MAX_DM_OTHERS = 8
const SENT_MAX = 50

/** The text as stored: trimmed, not too long, and not empty unless the message carries files (`optional`). */
function checkText(content: string, optional = false): string {
  const text = content.trim()
  if (!text && !optional) throw badRequest('Write a message first.')
  if (text.length > MAX_TEXT) throw badRequest(`Keep the message under ${MAX_TEXT} characters.`)
  return text
}

/** A body from the composer, checked, with its plain text (which the length rules apply to). */
export function checkBody(value: unknown, optional = false): { body: Body; text: string } {
  const body = validBody(value)
  if (!body) throw badRequest("That message couldn't be read.")
  return { body, text: checkText(bodyText(body), optional) }
}

/** A message's or reply's text and body, from the rich composer's body or else parsed from the text. */
const textOf = (content: string, body: unknown, optional: boolean) =>
  body === undefined ? { content: checkText(content, optional) } : (({ body: b, text }) => ({ content: text, body: b }))(checkBody(body, optional))

/** The files a new message or reply carries (spec 6.9): at most 10, uploaded by me, checked clean, not deleted. */
function attachFiles(data: DbData, ids: string[] | undefined, userId: string): Attachment[] {
  const unique = [...new Set(ids ?? [])]
  if (unique.length > MAX_MESSAGE_FILES) throw badRequest(`Attach up to ${MAX_MESSAGE_FILES} files to a message.`)
  return unique.map((id) => {
    const file = data.attachments.find((a) => a.id === id)
    if (!file || file.deletedAt) throw notFound('File', id)
    if (file.uploadedBy !== userId) throw new ApiError({ title: 'Forbidden', status: 403, detail: 'You can only send files you uploaded.' })
    if (file.scanStatus === 'blocked') throw badRequest(`${file.title} was blocked.`)
    if (file.scanStatus !== 'clean') throw badRequest(`${file.title} is still being checked.`)
    return clone(file)
  })
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

/**
 * checkCanPost, for a new message or reply: a channel set to Only admins (spec §9) takes them from Admins alone, and
 * Flowbot's DM takes none (reactions there are fine).
 */
export function checkCanWrite(data: DbData, channel: StoredChannel) {
  const me = checkCanPost(data, channel)
  if (isFlowbotDm(channel)) throw new ApiError({ title: 'Forbidden', status: 403, detail: FLOWBOT_READ_ONLY })
  if (!can('channel.post', { userId: me.id, role: me.role, channel })) {
    throw new ApiError({ title: 'Forbidden', status: 403, detail: onlyAdminsLine(channel) })
  }
  return me
}

const WHO_CAN_POST: WhoCanPost[] = ['everyone', 'admins']

/**
 * A channel whose details and people I may change (spec 6.10): not a DM, not a project's (it follows its project), and
 * not while archived (read-only until it's restored).
 */
function editableChannel(data: DbData, id: string) {
  const channel = readableChannel(data, id)
  if (channel.kind === 'dm') throw badRequest("Direct messages can't be edited.")
  if (data.projects.some((p) => p.channelId === id)) throw badRequest('This channel follows its project.')
  if (channel.archivedAt) throw badRequest('This channel is archived.')
  return { channel, me: requireManage(data, channel) }
}

type Row = ChatMessage | ThreadReply

/** The message or reply an action is about, its channel, and the message whose thread it is (itself for a message). */
function findTarget(data: DbData, target: ChatTarget): { row: Row; channel: StoredChannel; messageId: string } {
  if (target.kind === 'message') {
    const row = findMessage(data, target.id)
    // A broadcast reply is changed as the reply it is.
    if (row.broadcast) throw notFound('Message', target.id)
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

/**
 * Keeps Activity in step with a reaction (spec 6.12): someone else's on my message or reply is an item for me, and
 * taking it back removes it. Returns who to tell, when an item was added.
 */
function noteReaction(data: DbData, row: Row, channelId: string, messageId: string, emoji: string, actorId: string, added: boolean): string | null {
  const replyId = 'messageId' in row ? row.id : null
  const same = (n: DbData['notifications'][number]) => n.kind === 'reaction' && n.userId === row.senderId && n.actorId === actorId && n.emoji === emoji && n.messageId === messageId && n.replyId === replyId
  data.notifications = data.notifications.filter((n) => !same(n))
  // Not for my own reaction, nor where I can no longer read the channel (I left it, or was taken off it).
  if (!added || row.senderId === actorId || !canRead(data, channelId, row.senderId)) return null
  // After the latest item, so two quick reactions keep their order.
  const at = stamp(data.notifications.reduce<string | null>((latest, n) => (!latest || n.at > latest ? n.at : latest), null))
  data.notifications.push({ id: newId('n'), userId: row.senderId, kind: 'reaction', actorId, channelId, messageId, replyId, emoji, at, read: false })
  return row.senderId
}

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
  /** Archives or restores a channel: Admins who may manage it (spec 6.1); a project's channel follows its project, a DM never is. */
  const setArchived = async (id: string, archive: boolean) => {
    await delay()
    const result = await db.update((data) => {
      const channel = readableChannel(data, id)
      if (channel.kind === 'dm') throw badRequest("Conversations can't be archived.")
      if (data.projects.some((p) => p.channelId === id)) throw badRequest('This channel follows its project.')
      const me = requireManage(data, channel)
      // Archiving (and restoring) is for Admins (spec 6.1).
      if (!can('channel.archive', { userId: me.id, role: me.role, channel })) throw new ApiError({ title: 'Forbidden', status: 403, detail: 'Only admins can archive channels.' })
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
  const setMine = async (id: string, patch: Partial<Pick<ChannelMemberState, 'starred' | 'muted' | 'notifyLevel'>>) => {
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
        const dm: StoredChannel = { id: newId('c'), workspaceId, kind: 'dm', name: null, topic: '', description: '', whoCanPost: 'everyone', isDefault: false, memberIds: [me.id, ...others], isPrivate: true, lastMessageAt: null }
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
        const created: StoredChannel = { id: newId('c'), workspaceId: input.workspaceId, kind: 'channel', name, topic, description: '', whoCanPost: 'everyone', isDefault: false, memberIds: [me.id, ...others], isPrivate: input.isPrivate, lastMessageAt: null }
        data.channels.push(created)
        return withUnread(data, created)
      })
      hub.publish({ type: 'channelChanged', channelId: channel.id })
      return clone(channel)
    },
    async updateChannel(id, patch) {
      await delay()
      const { channel, posted } = await db.update((data) => {
        const { channel, me } = editableChannel(data, id)
        const name = (patch.name ?? channel.name ?? '').trim()
        const topic = (patch.topic ?? channel.topic).trim()
        const description = (patch.description ?? channel.description).trim()
        checkChannel(data, { workspaceId: channel.workspaceId, id, name, topic, isPrivate: channel.isPrivate })
        const wrongDescription = descriptionError(description)
        if (wrongDescription) throw badRequest(wrongDescription)
        // Checked when it's sent: a value stored before can't block an edit that leaves it alone.
        if (patch.whoCanPost !== undefined && !WHO_CAN_POST.includes(patch.whoCanPost)) throw badRequest('Choose Everyone or Only admins.')
        const whoCanPost = patch.whoCanPost ?? channel.whoCanPost
        if (whoCanPost !== channel.whoCanPost && !can('channel.restrictPosting', { userId: me.id, role: me.role, channel })) {
          throw new ApiError({ title: 'Forbidden', status: 403, detail: 'Only admins can change who can post.' })
        }
        // A default channel is one new people join (spec 6.10): an Admin's choice, and never a private channel.
        if (patch.isDefault !== undefined && typeof patch.isDefault !== 'boolean') throw badRequest('Turn the default channel on or off.')
        const isDefault = patch.isDefault ?? channel.isDefault
        if (isDefault !== channel.isDefault) {
          if (!can('channel.setDefault', { userId: me.id, role: me.role, channel })) throw new ApiError({ title: 'Forbidden', status: 403, detail: 'Only admins can choose default channels.' })
          if (isDefault && channel.isPrivate) throw badRequest("A private channel can't be a default channel.")
        }
        const posted: ChatMessage[] = []
        if (channel.name && name !== channel.name) posted.push(postSystem(data, id, { kind: 'renamed', from: channel.name, to: name }))
        if (topic !== channel.topic) posted.push(postSystem(data, id, { kind: 'topic', to: topic }))
        Object.assign(channel, { name, topic, description, whoCanPost, isDefault })
        return { channel: withUnread(data, channel), posted }
      })
      for (const message of posted) hub.publish({ type: 'messageReceived', message: clone(message) })
      hub.publish({ type: 'channelChanged', channelId: id })
      return clone(channel)
    },
    join: (id) => setMember(id, true),
    leave: (id) => setMember(id, false),
    async addMembers(id, userIds, emails = []) {
      await delay()
      const { channel, posted } = await db.update((data) => {
        const { channel, me } = editableChannel(data, id)
        const typed = [...new Set(emails.map(normalEmail).filter(Boolean))]
        if (!userIds.length && !typed.length) throw badRequest('Pick someone to add.')
        if (typed.length > MAX_INVITES) throw badRequest(`Invite up to ${MAX_INVITES} emails at a time.`)
        const wrong = typed.find((email) => !isEmail(email))
        if (wrong) throw badRequest(notAnEmailLine(wrong))
        // The email of someone in the workspace adds that person; the rest are invites, which only Admins send.
        const userByEmail = new Map(data.users.map((u) => [u.email.toLowerCase(), u.id]))
        const strangers = typed.filter((email) => !userByEmail.has(email))
        if (strangers.length && !can('channel.inviteByEmail', { userId: me.id, role: me.role, channel })) {
          throw new ApiError({ title: 'Forbidden', status: 403, detail: 'Only admins can invite people by email.' })
        }
        const picked = [...new Set([...userIds, ...typed.flatMap((email) => userByEmail.get(email) ?? [])])]
        // Joining is how I get into a channel; Add people is for others.
        if (picked.includes(me.id) && !channel.memberIds.includes(me.id)) throw badRequest('Join the channel instead.')
        const unknown = picked.find((userId) => !data.users.some((u) => u.id === userId))
        if (unknown) throw notFound('User', unknown)
        const added = picked.filter((userId) => !channel.memberIds.includes(userId))
        const invited = strangers.filter((email) => !data.invitations.some((i) => i.channelId === id && i.email === email && i.status === 'pending'))
        if (!added.length && !invited.length) {
          throw badRequest(typed.length ? `Everyone you picked is already in #${channel.name} or invited.` : `Everyone you picked is already in #${channel.name}.`)
        }
        channel.memberIds = [...channel.memberIds, ...added]
        const at = new Date().toISOString()
        for (const email of invited) {
          data.invitations.push({ id: newId('inv'), workspaceId: channel.workspaceId, channelId: id, email, role: 'guest', invitedBy: me.id, createdAt: at, status: 'pending' })
        }
        // An invite posts nothing: the emails stay out of the channel until the guest joins.
        return { channel: withUnread(data, channel), posted: added.length ? postSystem(data, id, { kind: 'added', userIds: added }) : null }
      })
      if (posted) hub.publish({ type: 'messageReceived', message: clone(posted) })
      hub.publish({ type: 'channelChanged', channelId: id })
      return clone(channel)
    },
    async invitations(channelId) {
      await delay()
      const data = await db.read()
      requireManage(data, readableChannel(data, channelId))
      return clone(data.invitations.filter((i) => i.channelId === channelId && i.status === 'pending'))
    },
    async revokeInvitation(invitationId) {
      await delay()
      const channelId = await db.update((data) => {
        const invite = data.invitations.find((i) => i.id === invitationId)
        if (!invite) throw notFound('Invitation', invitationId)
        readableChannel(data, invite.channelId)
        const me = currentUser(data)
        if (!can('invitation.revoke', { userId: me.id, role: me.role, invitedBy: invite.invitedBy })) {
          throw new ApiError({ title: 'Forbidden', status: 403, detail: 'Only whoever invited them, or an admin, can revoke this.' })
        }
        // An archived channel is read-only until it's restored, its invites included.
        if (findChannel(data, invite.channelId).archivedAt) throw badRequest('This channel is archived.')
        if (invite.status === 'revoked') throw badRequest('This invitation was revoked already.')
        if (invite.status === 'accepted') throw badRequest('They joined already.')
        invite.status = 'revoked'
        return invite.channelId
      })
      hub.publish({ type: 'channelChanged', channelId })
    },
    async removeMember(id, userId) {
      await delay()
      const { channel, posted } = await db.update((data) => {
        const { channel, me } = editableChannel(data, id)
        if (userId === me.id) throw badRequest('Leave the channel instead.')
        if (!channel.memberIds.includes(userId)) throw badRequest(`They’re not in #${channel.name}.`)
        channel.memberIds = channel.memberIds.filter((m) => m !== userId)
        return { channel: withUnread(data, channel), posted: postSystem(data, id, { kind: 'removed', userId }) }
      })
      hub.publish({ type: 'messageReceived', message: clone(posted) })
      hub.publish({ type: 'channelChanged', channelId: id })
      return clone(channel)
    },
    archiveChannel: (id) => setArchived(id, true),
    restoreChannel: (id) => setArchived(id, false),
    async react(target, emoji, on) {
      await delay()
      if (!isOneEmoji(emoji)) throw badRequest('Pick an emoji.')
      const { channelId, messageId, notified, same } = await db.update((data) => {
        const { row, channel, messageId } = findTarget(data, target)
        const me = checkCanPost(data, channel)
        if (row.deletedAt) throw badRequest("This message can't be changed.")
        const next = setReaction(row.reactions, emoji, me.id, on)
        if (!next) throw badRequest(`This message has ${MAX_DISTINCT_REACTIONS} different reactions already.`)
        // Already so (a retry): nothing changes, nothing is sent.
        if (next === row.reactions) return { channelId: channel.id, messageId, notified: null, same: true }
        row.reactions = next
        return { channelId: channel.id, messageId, notified: noteReaction(data, row, channel.id, messageId, emoji, me.id, on), same: false }
      })
      if (same) return
      changed(channelId, messageId)
      if (notified) hub.publish({ type: 'notificationCreated', userId: notified })
    },
    async edit(target, content, body) {
      await delay()
      const result = await db.update((data) => {
        const { row, channel, messageId } = findTarget(data, target)
        const me = checkCanPost(data, channel)
        if (!can('message.edit', { userId: me.id, role: me.role, authorId: row.senderId })) throw forbiddenOwn()
        checkPlain(row)
        // A message with a file may lose its text, as one can be sent with files alone.
        const optional = row.attachments.some((a) => !a.deletedAt)
        const input = body === undefined ? { text: checkText(content, optional), body: null } : checkBody(body, optional)
        const text = input.text
        const nextBody = input.body ?? parseBody(text)
        if (row.content === text && JSON.stringify(row.body) === JSON.stringify(nextBody)) return { row: clone(row), channelId: channel.id, messageId, same: true }
        row.content = text
        row.body = nextBody
        row.mentions = input.body ? mentionsOf(input.body) : parseMentions(text)
        keepHere(data, row, channel.id)
        row.editedAt = new Date().toISOString()
        if (target.kind === 'message') {
          const message = row as ChatMessage
          message.linkedTicketKeys = [...new Set([...(input.body ? bodyTaskKeys(input.body) : parseTicketKeys(text)), ...keysMadeFrom(data, message.id)])]
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
        // The author, or an Admin (spec §9: delete is author or admin).
        if (!can('message.delete', { userId: me.id, role: me.role, authorId: row.senderId })) throw forbiddenOwn()
        checkPlain(row)
        const now = Date.now()
        // What the delete takes is kept for Undo, and only that long; older entries go now.
        data.trash = data.trash.filter((t) => now - Date.parse(t.at) < UNDO_MS && t.id !== row.id)
        data.trash.push({
          id: row.id,
          kind: target.kind,
          by: me.id,
          at: new Date(now).toISOString(),
          snapshot: { content: row.content, body: row.body, attachments: row.attachments, mentions: row.mentions, reactions: row.reactions, ...('linkedTicketKeys' in row ? { linkedTicketKeys: row.linkedTicketKeys } : {}) },
        })
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
    async restore(target) {
      await delay()
      const { channelId, messageId } = await db.update((data) => {
        const { row, channel, messageId } = findTarget(data, target)
        const me = checkCanPost(data, channel)
        if (!row.deletedAt) throw badRequest("This message isn't deleted.")
        const entry = data.trash.find((t) => t.id === row.id && t.kind === target.kind)
        if (!entry || Date.now() - Date.parse(entry.at) >= UNDO_MS) throw badRequest("It's too late to undo that.")
        if (entry.by !== me.id) throw new ApiError({ title: 'Forbidden', status: 403, detail: 'Only whoever deleted it can undo that.' })
        // Its files as they are now: renamed or deleted since, the restored copy says so.
        const files = entry.snapshot.attachments.map((a) => clone(data.attachments.find((current) => current.id === a.id) ?? a))
        Object.assign(row, entry.snapshot, { attachments: files, deletedAt: null })
        data.trash = data.trash.filter((t) => t !== entry)
        return { channelId: channel.id, messageId }
      })
      changed(channelId, messageId)
    },
    async send(channelId, content, clientId, body, fileIds) {
      await delay()
      const { message, repeat, mentioned } = await db.update((data) => {
        findChannel(data, channelId) // 404 before anything else
        // A retry of a send that did arrive gets the message it stored, not a second one (spec §8: writes are idempotent),
        // even if who may post has changed since; the rights are for a new message.
        const stored = clientId ? data.messages.find((m) => m.channelId === channelId && m.senderId === data.currentUserId && m.clientId === clientId) : undefined
        if (stored) return { message: stored, repeat: true, mentioned: [] }
        return { ...writeMessage(data, { channelId, content, body, fileIds, clientId }), repeat: false }
      })
      if (!repeat) hub.publish({ type: 'messageReceived', message: clone(message) })
      // Who it mentions has something new in Activity (spec 6.12); nobody else's needs to refresh.
      for (const userId of mentioned) hub.publish({ type: 'notificationCreated', userId })
      return clone(message)
    },
    async reply(messageId, content, body, alsoInChannel, fileIds, clientId) {
      await delay()
      const { reply, notified, repeat } = await db.update((data) => {
        // A retry of a reply that did arrive gets the reply it stored (spec §8), as a send does.
        const stored = clientId ? data.replies.find((r) => r.messageId === messageId && r.senderId === data.currentUserId && r.clientId === clientId) : undefined
        if (stored) return { reply: stored, notified: [] as string[], repeat: true }
        return { ...writeReply(data, { messageId, content, body, alsoInChannel, fileIds, clientId }), repeat: false }
      })
      if (repeat) return clone(reply)
      hub.publish({ type: 'replyReceived', reply: clone(reply) })
      for (const userId of notified) hub.publish({ type: 'notificationCreated', userId })
      return clone(reply)
    },
    async setFollowing(messageId, following) {
      await delay()
      const message = await db.update((data) => {
        const root = findMessage(data, messageId)
        readableChannel(data, root.channelId)
        if (root.broadcast) throw badRequest('Threads are one level only.')
        const userId = data.currentUserId
        data.threadFollows = [...data.threadFollows.filter((f) => !(f.userId === userId && f.rootId === root.id)), { userId, rootId: root.id, following }]
        return root
      })
      hub.publish({ type: 'messageChanged', channelId: message.channelId, messageId: message.id })
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
      // The cursor is opaque to clients.
      return olderPage(data, channelId, cursor === undefined ? null : decodeCursor(cursor))
    },
    async messagesBefore(channelId, seq) {
      await delay()
      return olderPage(await db.read(), channelId, seq)
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
    async drafts(workspaceId) {
      await delay()
      const data = await db.read()
      const here = new Set(data.channels.filter((c) => c.workspaceId === workspaceId && visible(data, c)).map((c) => c.id))
      return data.drafts
        .filter((d) => d.userId === data.currentUserId && here.has(d.channelId))
        .map(({ channelId, rootId, body, updatedAt }) => ({ channelId, rootId, body, updatedAt }))
    },
    async sent(workspaceId) {
      await delay()
      const data = await db.read()
      const me = data.currentUserId
      const here = new Set(data.channels.filter((c) => c.workspaceId === workspaceId && canRead(data, c.id, me)).map((c) => c.id))
      const mine = (r: { senderId: string; channelId: string; deletedAt?: string | null }) => r.senderId === me && here.has(r.channelId) && !r.deletedAt
      // A reply also sent to the channel is listed once, as the reply.
      const items: SentItem[] = [
        ...data.messages.filter((m) => mine(m) && !m.system && !m.broadcast && !m.commentId && !m.taskEvent).map((m) => ({ target: { kind: 'message' as const, id: m.id }, channelId: m.channelId, rootId: null, text: rowText(m), createdAt: m.createdAt })),
        ...data.replies.filter(mine).map((r) => ({ target: { kind: 'reply' as const, id: r.id }, channelId: r.channelId, rootId: r.messageId, text: rowText(r), createdAt: r.createdAt })),
      ]
      return items.filter((i) => i.text).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, SENT_MAX)
    },
    async saveDraft(channelId, value, rootId = null) {
      await delay()
      const body = validBody(value)
      if (!body) throw badRequest("That draft couldn't be read.")
      const result = await db.update((data) => {
        readableChannel(data, channelId)
        const userId = data.currentUserId
        const at = data.drafts.findIndex((d) => d.userId === userId && d.channelId === channelId && d.rootId === rootId)
        // Nothing written is no draft.
        if (!bodyText(body).trim()) {
          if (at >= 0) data.drafts.splice(at, 1)
          return { draft: null, userId }
        }
        const draft = { id: at >= 0 ? data.drafts[at].id : newId('d'), userId, channelId, rootId, body, updatedAt: new Date().toISOString() }
        if (at >= 0) data.drafts[at] = draft
        else data.drafts.push(draft)
        return { draft: { channelId, rootId, body, updatedAt: draft.updatedAt }, userId }
      })
      hub.publish({ type: 'draftChanged', userId: result.userId, channelId })
      return result.draft
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
    async markUnread(channelId, seq) {
      await delay()
      const result = await db.update((data) => {
        readableChannel(data, channelId)
        if (!Number.isInteger(seq) || seq < 1 || seq > lastSeqOf(data, channelId)) throw badRequest("That message isn't in this channel.")
        const state = myState(data, channelId)
        state.lastReadSeq = seq - 1
        return { userId: data.currentUserId, seq: state.lastReadSeq }
      })
      hub.publish({ type: 'readChanged', userId: result.userId, channelId, seq: result.seq })
    },
    setStarred: (id, starred) => setMine(id, { starred }),
    setMuted: (id, muted) => setMine(id, { muted }),
    async setNotifyLevel(id, level) {
      if (!NOTIFY_LEVELS.includes(level)) {
        await delay()
        throw badRequest('Choose All new messages, Mentions or Nothing.')
      }
      return setMine(id, { notifyLevel: level })
    },
  }
}

// ── Mutations (not on Api until Phases 3–4) ───────────────────────────────

export type SendMessageInput = { channelId: string; content: string; attachments?: Attachment[]; clientId?: string; body?: Body }
export type AddReplyInput = { messageId: string; content: string; body?: Body; alsoInChannel?: boolean; attachments?: Attachment[]; clientId?: string }

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
    linkedTicketKeys: input.body ? bodyTaskKeys(input.body) : parseTicketKeys(input.content),
    mentions: input.body ? mentionsOf(input.body) : parseMentions(input.content),
    body: input.body ?? parseBody(input.content),
    editedAt: null,
    createdAt,
    ...extra,
  }
  keepHere(data, created, channel.id)
  data.messages.push(created)
  channel.lastMessageAt = createdAt
  return created
}

/**
 * Keeps who a row's @here reaches (spec 6.8): worked out once, when @here first appears in it (sent, or added by an
 * edit), and dropped when an edit takes it out. Activity reads it, so a later change of presence changes nothing.
 */
function keepHere(data: DbData, row: { mentions: Mention[]; hereIds?: string[]; senderId: string }, channelId: string) {
  const has = row.mentions.some((m) => m.kind === 'here')
  if (has && !row.hereIds) row.hereIds = hereReached(data, channelId, row.senderId)
  if (!has) delete row.hereIds
}

/** What the channel says about a change the current user made (joined, left, renamed, topic changed). */
function postSystem(data: DbData, channelId: string, event: SystemEvent): ChatMessage {
  return postMessage(data, { channelId, content: '' }, { system: event })
}

/** Adds a thread reply from the current user inside a transaction. */
export function postReply(data: DbData, input: AddReplyInput): ThreadReply {
  const parent = findMessage(data, input.messageId)
  if (parent.broadcast) throw badRequest('Threads are one level only.')
  const channel = findChannel(data, parent.channelId)
  const createdAt = stamp(parent.lastReplyAt)
  const created: ThreadReply = {
    id: newId('r'),
    messageId: parent.id,
    channelId: parent.channelId,
    senderId: data.currentUserId,
    content: input.content,
    attachments: input.attachments ?? [],
    reactions: [],
    mentions: input.body ? mentionsOf(input.body) : parseMentions(input.content),
    body: input.body ?? parseBody(input.content),
    createdAt,
    ...(input.clientId ? { clientId: input.clientId } : {}),
  }
  keepHere(data, created, channel.id)
  if (input.alsoInChannel) {
    // Also sent to the channel (spec 6.7): it takes the channel's next seq; the channel keeps only its place there.
    created.alsoInChannel = true
    created.seq = lastSeqOf(data, channel.id) + 1
    data.messages.push({
      id: created.id, channelId: channel.id, seq: created.seq, senderId: created.senderId, content: '', body: [], attachments: [], reactions: [],
      threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [], editedAt: null, createdAt, broadcast: { rootId: parent.id, rootText: '' },
    })
  }
  data.replies.push(created)
  // Replying, or being mentioned in a reply, follows the thread again, whatever was chosen before.
  const named = new Set(created.mentions.flatMap((m) => (m.kind === 'user' ? [m.id] : [])))
  const again = new Set([created.senderId, ...named])
  data.threadFollows = data.threadFollows.filter((f) => f.rootId !== parent.id || !again.has(f.userId))
  // Everyone who follows it hears of the reply in Activity (spec 6.12): not the one who wrote it, not someone who can't
  // read the channel. Those it mentions see the mention instead, worked out as the reply reads now (activityFor).
  const replies = data.replies.filter((r) => r.messageId === parent.id)
  for (const user of data.users) {
    if (user.id === created.senderId || !canRead(data, channel.id, user.id) || !follows(data, parent, replies, user.id)) continue
    data.notifications.push({ id: newId('n'), userId: user.id, kind: 'thread', actorId: created.senderId, channelId: channel.id, messageId: parent.id, replyId: created.id, emoji: null, at: createdAt, read: false })
  }
  parent.threadCount += 1
  parent.lastReplyAt = createdAt
  channel.lastMessageAt = createdAt
  return created
}

type WriteInput = { content: string; body?: unknown; fileIds?: string[]; clientId?: string }

/**
 * A new message from the current user, with every check a send makes (who may post, the text, the files), inside a
 * transaction; whom it mentions. Sending and the scheduler (a scheduled message) both write through it.
 */
export function writeMessage(data: DbData, input: WriteInput & { channelId: string }): { message: ChatMessage; mentioned: string[] } {
  const me = checkCanWrite(data, findChannel(data, input.channelId))
  const attachments = attachFiles(data, input.fileIds, me.id)
  const message = postMessage(data, { channelId: input.channelId, clientId: input.clientId, attachments, ...textOf(input.content, input.body, attachments.length > 0) })
  return { message, mentioned: reachedBy(data, message, input.channelId, me.id) }
}

/** writeMessage for a thread reply; whom to tell: followers with a thread item, and whoever it mentions, each once. */
export function writeReply(data: DbData, input: WriteInput & { messageId: string; alsoInChannel?: boolean }): { reply: ThreadReply; notified: string[] } {
  const me = checkCanWrite(data, findChannel(data, findMessage(data, input.messageId).channelId))
  const attachments = attachFiles(data, input.fileIds, me.id)
  const reply = postReply(data, { messageId: input.messageId, clientId: input.clientId, attachments, ...textOf(input.content, input.body, attachments.length > 0), alsoInChannel: Boolean(input.alsoInChannel) })
  const followers = data.notifications.filter((n) => n.replyId === reply.id).map((n) => n.userId)
  return { reply, notified: [...new Set([...followers, ...reachedBy(data, reply, reply.channelId, reply.senderId)])] }
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
