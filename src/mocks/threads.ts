import type { Api, ThreadCard } from '@/api/types'
import { follows, mutedThread, withThread } from './chat'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { silenced } from './membership'
import { mentionsFor } from './mentions'
import type { MockHub } from './realtime'
import { badRequest, clone, currentUser } from './shared'

const PAGE = 20
const MIN_SHOWN = 2
const MAX_SHOWN = 10
const FACES = 5

/** Newest first, by an ISO time. */
const newestFirst = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)

/**
 * The replies I haven't read, by id: a stored thread item (spec 6.7 following) still unread, or a reply that mentions
 * me whose mention is unread. One read state with Activity and the bell, so reading in one place reads in all; and
 * like them, nothing from a channel set to Nothing.
 */
function unreadReplyIds(data: DbData, userId: string): Set<string> {
  const quiet = silenced(data, userId)
  const out = new Set<string>()
  for (const n of data.notifications) if (n.userId === userId && n.kind === 'thread' && !n.read && n.replyId && !quiet(n.channelId)) out.add(n.replyId)
  const read = new Set(data.mentionReads[userId] ?? [])
  for (const m of mentionsFor(data, userId, (m) => m.source === 'reply' && !quiet(m.channelId), Infinity)) if (!read.has(m.id)) out.add(m.id)
  return out
}

/** Every thread I follow in a workspace, as cards, unread first and then newest reply first. */
export function threadCards(data: DbData, userId: string, workspaceId: string): ThreadCard[] {
  const unread = unreadReplyIds(data, userId)
  const mine = new Set(data.channels.filter((c) => c.workspaceId === workspaceId && c.memberIds.includes(userId)).map((c) => c.id))
  const cards: ThreadCard[] = []
  for (const root of data.messages) {
    if (!mine.has(root.channelId) || root.broadcast || root.system) continue
    const replies = data.replies.filter((r) => r.messageId === root.id).sort((a, b) => -newestFirst(a.createdAt, b.createdAt))
    const live = replies.filter((r) => !r.deletedAt)
    if (live.length === 0 || !follows(data, root, replies, userId)) continue
    const unreadCount = live.filter((r) => r.senderId !== userId && unread.has(r.id)).length
    const shown = Math.min(MAX_SHOWN, Math.max(MIN_SHOWN, unreadCount))
    const people = [...new Set([...[...live].reverse().map((r) => r.senderId), root.senderId])]
    // The newest repliers, then the parent's author.
    const participantIds = [...people.filter((id) => id !== root.senderId).slice(0, FACES - 1), root.senderId].slice(0, FACES)
    cards.push({
      root: withThread(data, root), channelId: root.channelId, replies: live.slice(-shown),
      totalReplies: live.length, unreadCount, participantIds, lastReplyAt: live.at(-1)!.createdAt, muted: mutedThread(data, root.id, userId),
    })
  }
  return cards.sort((a, b) => Number(b.unreadCount > 0) - Number(a.unreadCount > 0) || newestFirst(a.lastReplyAt, b.lastReplyAt))
}

/** The Threads view (spec 6.12): followed threads, paged by 20, and reading them (Activity's read state). */
export function threadsApi(db: MockDb, hub: MockHub): Api['threads'] {
  return {
    async list(workspaceId, cursor) {
      await delay()
      const data = await db.read()
      const all = threadCards(data, currentUser(data).id, workspaceId)
      const from = cursor === undefined ? 0 : Number(cursor)
      if (!Number.isInteger(from) || from < 0) throw badRequest('That page is gone. Reload the list.')
      const next = from + PAGE
      return clone({ items: all.slice(from, next), nextCursor: next < all.length ? String(next) : null, unreadThreads: all.filter((c) => c.unreadCount > 0).length })
    },
    async markRead(workspaceId, rootIds) {
      await delay()
      const userId = await db.update((data) => {
        const me = currentUser(data).id
        // Only threads of mine in this workspace; anything else is skipped, not refused (a stale list may ask).
        const roots = new Set(threadCards(data, me, workspaceId).map((c) => c.root.id).filter((id) => rootIds.includes(id)))
        for (const n of data.notifications) if (n.userId === me && n.kind === 'thread' && roots.has(n.messageId ?? '')) n.read = true
        const mentioned = mentionsFor(data, me, (m) => m.source === 'reply' && roots.has(m.messageId ?? ''), Infinity).map((m) => m.id)
        data.mentionReads[me] = [...new Set([...(data.mentionReads[me] ?? []), ...mentioned])]
        return me
      })
      hub.publish({ type: 'readChanged', userId })
    },
  }
}
