import type { ChatMessage, ThreadReply } from '@/api/types'
import { localDay } from '@/lib/dates'
import { formatDayDivider } from '@/lib/format'

/** One row of a channel's message list: the intro at its very start, a day's divider, the New line, or a message. */
export type MessageListRow =
  | { kind: 'intro'; key: 'intro' }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'new'; key: string }
  | { kind: 'message'; key: string; message: ChatMessage; continuation: boolean }

const GROUP_MS = 5 * 60_000

/**
 * Cards, system messages and deleted placeholders stand alone: they never take an author line from, or give one to,
 * a neighbour (a placeholder keeps its author, so it's clear whose message is gone).
 */
const standsAlone = (m: ChatMessage | ThreadReply) =>
  Boolean(m.deletedAt || ('taskEvent' in m && m.taskEvent) || ('commentId' in m && m.commentId) || ('system' in m && m.system) || ('broadcast' in m && m.broadcast))

/**
 * Whether `next` renders as a continuation of `prev` (spec 6.2): same author, same day, at most 5 minutes later,
 * neither is a card, and `prev` has no thread replies.
 */
export function canContinue(prev: ChatMessage | ThreadReply, next: ChatMessage | ThreadReply): boolean {
  const gap = new Date(next.createdAt).getTime() - new Date(prev.createdAt).getTime()
  return (
    prev.senderId === next.senderId &&
    localDay(new Date(prev.createdAt)) === localDay(new Date(next.createdAt)) &&
    gap >= 0 &&
    gap <= GROUP_MS &&
    !standsAlone(prev) &&
    !standsAlone(next) &&
    // A reply has no thread of its own.
    (!('threadCount' in prev) || prev.threadCount === 0)
  )
}

/** "Today", "Yesterday", "Wednesday 4 November", with the year when it isn't this year's (spec 6.2; UX Phase 3, 3.4). */
export function dayLabel(day: Date, now: Date): string {
  return formatDayDivider(day, now)
}

/** Whether a message is one I haven't read: someone else's, after my marker, not what the channel itself says. */
const unread = (m: ChatMessage, newAfterSeq: number | null, meId?: string) => newAfterSeq !== null && m.seq > newAfterSeq && m.senderId !== meId && !m.system

/**
 * The list's rows from its messages, oldest first: a divider at each day, the New line before the first message
 * someone else sent after `newAfterSeq` (my read marker when the channel opened), and which messages continue a group.
 * With `hasOlder` (more pages above) the New line waits until the marker's own message is loaded: before that, the
 * first unread message may not be among these.
 */
export function buildRows(
  messages: ChatMessage[],
  { newAfterSeq, meId, now, hasOlder = false, intro = false }: { newAfterSeq: number | null; meId?: string; now: Date; hasOlder?: boolean; intro?: boolean },
): MessageListRow[] {
  // The channel's intro (chat spec 6.14) heads its history once the list holds the very start.
  const rows: MessageListRow[] = intro && !hasOlder ? [{ kind: 'intro', key: 'intro' }] : []
  let prev: ChatMessage | null = null
  const markerLoaded = !hasOlder || (newAfterSeq !== null && messages.length > 0 && messages[0].seq <= newAfterSeq)
  let newShown = !markerLoaded
  for (const message of messages) {
    // A deleted message is gone from the list, unless its thread needs it to hang from (spec 6.3).
    if (message.deletedAt && message.threadCount === 0) continue
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

export type JumpChoice = 'today' | 'yesterday' | 'week' | 'month' | 'beginning' | { date: string }

/** Where a choice in the date menu starts (local midnight), or null for the very beginning. */
export function jumpSince(choice: JumpChoice, now: Date): string | null {
  // A day picked (YYYY-MM-DD): its local midnight.
  if (typeof choice === 'object') {
    const [year, month, day] = choice.date.split('-').map(Number)
    return new Date(year, month - 1, day).toISOString()
  }
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const start = { today: new Date(y, m, d), yesterday: new Date(y, m, d - 1), week: new Date(y, m, d - 7), month: new Date(y, m - 1, d), beginning: null }[choice]
  return start ? start.toISOString() : null
}
