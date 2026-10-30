import type { ThreadCard } from '@/api/types'

/**
 * The Threads view's order (spec 6.12): unread threads first, then the rest, each newest reply first. A thread that was
 * unread at any point while the view is open (`everUnread`) stays with the unread ones, so reading it doesn't move it;
 * a new reply still moves its thread up.
 */
export function orderThreads(cards: ThreadCard[], everUnread: ReadonlySet<string>): ThreadCard[] {
  const unread = (c: ThreadCard) => (c.unreadCount > 0 || everUnread.has(c.root.id) ? 1 : 0)
  return [...cards].sort((a, b) => unread(b) - unread(a) || (a.lastReplyAt < b.lastReplyAt ? 1 : a.lastReplyAt > b.lastReplyAt ? -1 : 0))
}
