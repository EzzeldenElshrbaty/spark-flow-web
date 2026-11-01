import type { Api, ChatMessage, SavedItem, SavedStatus, SavedTarget, SavedView, ThreadReply } from '@/api/types'
import { senderName } from '@/lib/flowbot'
import { bodyText } from '@/lib/messageBody'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { canRead } from './membership'
import type { MockHub } from './realtime'
import { badRequest, clone, currentUser, newId, notFound } from './shared'

const STATUSES: SavedStatus[] = ['inProgress', 'archived', 'completed']
/** How long a /remind note may be. */
const NOTE_MAX = 1000

/** What a saved target points at: the message or reply, its channel, and the thread it's in. */
export function savedRow(data: DbData, target: SavedTarget): { row: ChatMessage | ThreadReply; channelId: string; messageId: string; replyId: string | null } | null {
  // A note or a file is no message: nothing to find among the rows.
  if (target.kind === 'note' || target.kind === 'file') return null
  if (target.kind === 'message') {
    const row = data.messages.find((m) => m.id === target.id)
    return row ? { row, channelId: row.channelId, messageId: row.id, replyId: null } : null
  }
  const row = data.replies.find((r) => r.id === target.id)
  return row ? { row, channelId: row.channelId, messageId: row.messageId, replyId: row.id } : null
}

/** The text of a row as people read it (`@Name`), on one line. */
export const rowText = (row: Pick<ChatMessage, 'body' | 'content'>) => (row.body.length > 0 ? bodyText(row.body) : row.content).replace(/\s+/g, ' ').trim()

/** A saved item as its owner sees it now: an edit shows, and a deleted or out-of-reach message keeps no text. */
/** Where a file is shared that `userId` can read: the first message or reply, oldest first. */
export function filePlace(data: DbData, fileId: string, userId: string): { channelId: string; messageId: string; replyId: string | null } | null {
  const has = (row: { attachments: { id: string }[] }) => row.attachments.some((a) => a.id === fileId)
  const rows = [
    ...data.messages.filter((m) => has(m) && !m.broadcast).map((m) => ({ at: m.createdAt, channelId: m.channelId, messageId: m.id, replyId: null })),
    ...data.replies.filter(has).map((r) => ({ at: r.createdAt, channelId: r.channelId, messageId: r.messageId, replyId: r.id })),
  ]
    .filter((p) => canRead(data, p.channelId, userId))
    .sort((a, b) => a.at.localeCompare(b.at))
  const [first] = rows
  return first ? { channelId: first.channelId, messageId: first.messageId, replyId: first.replyId } : null
}

function viewOf(data: DbData, item: SavedItem): SavedView {
  if (item.target.kind === 'file') {
    const fileId = item.target.id
    const file = data.attachments.find((a) => a.id === fileId)
    const place = file && !file.deletedAt ? filePlace(data, fileId, item.userId) : null
    const none = { channelId: null, rootId: null, createdAt: null, authorId: null, authorName: null, text: '', file: null, messageId: null }
    if (!file || file.deletedAt) return { ...item, ...none, gone: 'deleted' }
    if (!place) return { ...item, ...none, gone: 'hidden' }
    return {
      ...item, channelId: place.channelId, rootId: place.replyId ? place.messageId : null, messageId: place.replyId ? null : place.messageId,
      createdAt: file.createdAt, authorId: file.uploadedBy, authorName: senderName(file.uploadedBy, data.users), text: file.title, file, gone: null,
    }
  }
  // A /remind note is my own words: I'm its author, and it opens the channel it was set in.
  if (item.target.kind === 'note') {
    const authorName = senderName(item.userId, data.users)
    return { ...item, channelId: item.target.channelId, rootId: null, createdAt: item.savedAt, authorId: item.userId, authorName, text: item.target.text, gone: null }
  }
  const found = savedRow(data, item.target)
  const base = { ...item, channelId: found?.channelId ?? null, rootId: found?.replyId ? found.messageId : null, createdAt: found?.row.createdAt ?? null }
  if (!found || found.row.deletedAt) return { ...base, authorId: null, authorName: null, text: '', gone: 'deleted' }
  if (!canRead(data, found.channelId, item.userId)) return { ...base, authorId: null, authorName: null, text: '', gone: 'hidden' }
  return { ...base, authorId: found.row.senderId, authorName: senderName(found.row.senderId, data.users), text: rowText(found.row), gone: null }
}

/** Reminders first, soonest first; then the rest, newest saved first. */
const order = (a: SavedItem, b: SavedItem) =>
  a.remindAt && b.remindAt ? a.remindAt.localeCompare(b.remindAt) : a.remindAt ? -1 : b.remindAt ? 1 : b.savedAt.localeCompare(a.savedAt)

/** Saved (spec 6.12) and Remind me (spec 6.5): one item per person and message, its status and reminder. */
export function savedApi(db: MockDb, hub: MockHub, now: () => Date): Api['saved'] {
  const future = (value: unknown): string => {
    const time = typeof value === 'string' ? Date.parse(value) : NaN
    if (Number.isNaN(time)) throw badRequest('Pick a date and time.')
    if (time <= now().getTime()) throw badRequest('Pick a time in the future.')
    return new Date(time).toISOString()
  }
  /** One of my items, or 404: someone else's is not found, so nobody learns it exists. */
  const mine = (data: DbData, id: string) => {
    const item = data.saved.find((s) => s.id === id && s.userId === data.currentUserId)
    if (!item) throw notFound('Saved item', id)
    return item
  }
  const changed = (userId: string) => hub.publish({ type: 'savedChanged', userId })
  /** Save for later on a file I can see where it's shared (spec 6.9): the same item each time, In progress. */
  const saveFile = (data: DbData, userId: string, fileId: string, at: string | undefined): SavedView => {
    const file = data.attachments.find((a) => a.id === fileId)
    const place = file && !file.deletedAt ? filePlace(data, fileId, userId) : null
    const channel = place && data.channels.find((c) => c.id === place.channelId)
    if (!file || !place || !channel) throw notFound('File', fileId)
    let item = data.saved.find((s) => s.userId === userId && s.target.kind === 'file' && s.target.id === fileId)
    if (!item) {
      item = { id: newId('sav'), userId, workspaceId: channel.workspaceId, target: { kind: 'file', id: fileId }, status: 'inProgress', remindAt: null, firedAt: null, savedAt: now().toISOString() }
      data.saved.push(item)
    }
    item.status = 'inProgress'
    if (at) {
      item.remindAt = at
      item.firedAt = null
    }
    return viewOf(data, item)
  }

  return {
    async list(workspaceId) {
      await delay()
      const data = await db.read()
      const me = currentUser(data)
      return clone(data.saved.filter((s) => s.userId === me.id && s.workspaceId === workspaceId).sort(order).map((s) => viewOf(data, s)))
    },
    async save(target, remindAt) {
      await delay()
      const view = await db.update((data) => {
        const me = currentUser(data)
        if (target.kind === 'file') return saveFile(data, me.id, target.id, remindAt === undefined ? undefined : future(remindAt))
        const found = savedRow(data, target)
        const channel = found && data.channels.find((c) => c.id === found.channelId)
        if (!found || !channel || !canRead(data, channel.id, me.id)) throw notFound(target.kind === 'message' ? 'Message' : 'Reply', target.id)
        if (found.row.deletedAt) throw badRequest('This message was deleted.')
        const at = remindAt === undefined ? undefined : future(remindAt)
        let item = data.saved.find((s) => s.userId === me.id && s.target.kind === target.kind && 'id' in s.target && s.target.id === target.id)
        if (!item) {
          item = { id: newId('sav'), userId: me.id, workspaceId: channel.workspaceId, target: { kind: target.kind, id: target.id }, status: 'inProgress', remindAt: null, firedAt: null, savedAt: now().toISOString() }
          data.saved.push(item)
        }
        item.status = 'inProgress'
        if (at) {
          item.remindAt = at
          item.firedAt = null
        }
        return viewOf(data, item)
      })
      changed(view.userId)
      return clone(view)
    },
    async update(id, patch) {
      await delay()
      const view = await db.update((data) => {
        const item = mine(data, id)
        if (patch.status !== undefined) {
          if (!STATUSES.includes(patch.status)) throw badRequest('That isn’t a status.')
          item.status = patch.status
          // Done with, or put away: its reminder no longer stands.
          if (patch.status !== 'inProgress') item.remindAt = null
        }
        if (patch.remindAt !== undefined) {
          item.remindAt = patch.remindAt === null ? null : future(patch.remindAt)
          item.firedAt = null
          if (item.remindAt) item.status = 'inProgress'
        }
        return viewOf(data, item)
      })
      changed(view.userId)
      return clone(view)
    },
    async note(channelId, text, remindAt) {
      await delay()
      const view = await db.update((data) => {
        const me = currentUser(data)
        const channel = data.channels.find((c) => c.id === channelId)
        if (!channel || !canRead(data, channel.id, me.id)) throw notFound('Channel', channelId)
        const words = typeof text === 'string' ? text.trim() : ''
        if (!words) throw badRequest('Write what to remind you about.')
        if (words.length > NOTE_MAX) throw badRequest('Keep a reminder under 1,000 characters.')
        const item: SavedItem = {
          id: newId('sav'), userId: me.id, workspaceId: channel.workspaceId, target: { kind: 'note', text: words, channelId: channel.id },
          status: 'inProgress', remindAt: future(remindAt), firedAt: null, savedAt: now().toISOString(),
        }
        data.saved.push(item)
        return viewOf(data, item)
      })
      changed(view.userId)
      return clone(view)
    },
    async remove(id) {
      await delay()
      const userId = await db.update((data) => {
        const item = mine(data, id)
        data.saved = data.saved.filter((s) => s !== item)
        return item.userId
      })
      changed(userId)
    },
  }
}
