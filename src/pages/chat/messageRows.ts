import type { ChatMessage } from '@/api/types'
import { localDay } from '@/lib/dates'

/** One row of a channel's message list: a day's divider, the New line, or a message. */
export type MessageListRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'new'; key: string }
  | { kind: 'message'; key: string; message: ChatMessage; continuation: boolean }

const GROUP_MS = 5 * 60_000

/** Cards stand alone: they never take an author line from, or give one to, a neighbour. */
const isCard = (m: ChatMessage) => Boolean(m.taskEvent || m.commentId)

/**
 * Whether `next` renders as a continuation of `prev` (spec 6.2): same author, same day, at most 5 minutes later,
 * neither is a card, and `prev` has no thread replies.
 */
export function canContinue(prev: ChatMessage, next: ChatMessage): boolean {
  const gap = new Date(next.createdAt).getTime() - new Date(prev.createdAt).getTime()
  return (
    prev.senderId === next.senderId &&
    localDay(new Date(prev.createdAt)) === localDay(new Date(next.createdAt)) &&
    gap >= 0 &&
    gap <= GROUP_MS &&
    !isCard(prev) &&
    !isCard(next) &&
    prev.threadCount === 0
  )
}

/** "Today", "Yesterday", "Friday, October 23", with the year when it isn't this year's (spec 6.2). */
export function dayLabel(day: Date, now: Date): string {
  const today = localDay(now)
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (localDay(day) === today) return 'Today'
  if (localDay(day) === localDay(yesterday)) return 'Yesterday'
  return day.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(day.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** Whether a message is one I haven't read: someone else's, after my marker. */
const unread = (m: ChatMessage, newAfterSeq: number | null, meId?: string) => newAfterSeq !== null && m.seq > newAfterSeq && m.senderId !== meId

/**
 * The list's rows from its messages, oldest first: a divider at each day, the New line before the first message
 * someone else sent after `newAfterSeq` (my read marker when the channel opened), and which messages continue a group.
 * With `hasOlder` (more pages above) the New line waits until the marker's own message is loaded: before that, the
 * first unread message may not be among these.
 */
export function buildRows(
  messages: ChatMessage[],
  { newAfterSeq, meId, now, hasOlder = false }: { newAfterSeq: number | null; meId?: string; now: Date; hasOlder?: boolean },
): MessageListRow[] {
  const rows: MessageListRow[] = []
  let prev: ChatMessage | null = null
  const markerLoaded = !hasOlder || (newAfterSeq !== null && messages.length > 0 && messages[0].seq <= newAfterSeq)
  let newShown = !markerLoaded
  for (const message of messages) {
    const day = localDay(new Date(message.createdAt))
    const newDay = !prev || localDay(new Date(prev.createdAt)) !== day
    if (newDay) rows.push({ kind: 'day', key: `day-${day}`, label: dayLabel(new Date(message.createdAt), now) })
    const startsNew = !newShown && unread(message, newAfterSeq, meId)
    if (startsNew) {
      newShown = true
      rows.push({ kind: 'new', key: 'new' })
    }
    rows.push({ kind: 'message', key: message.id, message, continuation: !newDay && !startsNew && prev !== null && canContinue(prev, message) })
    prev = message
  }
  return rows
}

/** What the unread bar says: how many messages others sent after my marker, and when the first one came. */
export function unreadSummary(messages: ChatMessage[], newAfterSeq: number | null, meId?: string): { count: number; since: string | null } {
  const mine = messages.filter((m) => unread(m, newAfterSeq, meId))
  return { count: mine.length, since: mine[0]?.createdAt ?? null }
}
