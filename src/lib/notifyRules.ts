import type { ChannelKind, Mention, NotifyLevel, Preferences, User } from '@/api/types'
import { senderName } from '@/lib/flowbot'
import { formatTime } from '@/lib/format'
import { bodyText, type Body } from '@/lib/messageBody'
import { matchedKeyword } from '@/lib/searchQuery'

/** Why Do Not Disturb is on (spec 6.11) and when it ends (ISO): paused until a time, or inside the daily schedule. */
export type DndState = { reason: 'paused' | 'schedule'; until: string }

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The weekday (0 = Sunday) and minute of the day it is in a time zone. */
function localClock(now: Date, tz: string): { day: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]),
  )
  return { day: WEEKDAYS.indexOf(parts.weekday), minute: Number(parts.hour) * 60 + Number(parts.minute) }
}

/**
 * Whether Do Not Disturb is on now (spec 6.11: "Do Not Disturb has a schedule"). A pause wins. A schedule is read in
 * its own zone; one that runs past midnight (18:00 to 09:00) belongs to the day it starts, so Thursday's night ends on
 * Friday morning even when Friday is off.
 */
export function dndState(prefs: Pick<Preferences, 'dndUntil' | 'dndSchedule'>, now: Date): DndState | null {
  if (prefs.dndUntil && now.getTime() < Date.parse(prefs.dndUntil)) return { reason: 'paused', until: prefs.dndUntil }
  const s = prefs.dndSchedule
  if (!s.on || s.days.length === 0) return null
  const { day, minute } = localClock(now, s.tz)
  const from = minutesOf(s.from)
  const to = minutesOf(s.to)
  const on = from < to ? s.days.includes(day) && minute >= from && minute < to : (s.days.includes(day) && minute >= from) || (s.days.includes((day + 6) % 7) && minute < to)
  return on ? { reason: 'schedule', until: nextClock(now, s.tz, to) } : null
}

const DAY = 1440
/** -720 to 719: a difference of clock minutes, the short way round. */
const wrap = (minutes: number) => ((((minutes + 720) % DAY) + DAY) % DAY) - 720

/** The next time the clock in `tz` reads `minute` (of the day), as an ISO time; a clock change on the way is allowed for. */
function nextClock(now: Date, tz: string, minute: number): string {
  const ahead = (minute - localClock(now, tz).minute + DAY) % DAY || DAY
  const at = Math.floor(now.getTime() / 60_000) * 60_000 + ahead * 60_000
  return new Date(at + wrap(minute - localClock(new Date(at), tz).minute) * 60_000).toISOString()
}

/** When Do Not Disturb ends, as the bell menu and the avatar say it: "9:00 AM", "tomorrow at 9:00 AM", "Mon 2 Nov at 9:00 AM". */
export function dndEndLabel(state: DndState, now: Date): string {
  const end = new Date(state.until)
  const days = Math.round((new Date(end).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days <= 0) return formatTime(end)
  if (days === 1) return `tomorrow at ${formatTime(end)}`
  return `${end.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${formatTime(end)}`
}

/** "09:00" as people read it: "9:00 AM". */
export function clockLabel(hhmm: string): string {
  return formatTime(new Date(2000, 0, 1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5))))
}

/** Pause notifications for (spec 6.11): the quick choices, from now. */
export function pausePresets(now: Date): { label: string; until: string }[] {
  const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString()
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0)
  return [
    { label: '30 minutes', until: later(30) },
    { label: '1 hour', until: later(60) },
    { label: '2 hours', until: later(120) },
    { label: 'Until tomorrow at 9:00 AM', until: tomorrow.toISOString() },
  ]
}

/**
 * Whether a row is someone's own words, which keywords can match: not what the channel itself says, a task's card or
 * a comment's card, nor a reply's copy in the channel (the reply is the one that counts). The bell and desktop agree.
 */
export const keywordable = (row: { system?: unknown; taskEvent?: unknown; commentId?: unknown; broadcast?: unknown }): boolean =>
  !row.system && !row.taskEvent && !row.commentId && !row.broadcast

/** Whether a message's mentions reach me: by name, @channel, or the @here that reached me when it was sent. */
const reachesMe = (row: { mentions: Mention[]; hereIds?: string[] }, meId: string) =>
  row.mentions.some((m) => (m.kind === 'user' && m.id === meId) || m.kind === 'all' || (m.kind === 'here' && (row.hereIds?.includes(meId) ?? false)))

/**
 * Whether a new message or reply should reach me outside the app (spec 6.11 delivery): one rule for desktop here and
 * for the backend's push and email, each of which also has its own switch. Never my own or what the channel itself
 * says, never in a muted channel or one at Nothing, never during Do Not Disturb; at All (a DM's default), every
 * message; at Mentions and keywords, a mention of me or one of my keywords in someone's own words (`keywordable`). A
 * reply in a thread I muted counts as at Mentions and keywords whatever the level.
 */
export function notifies(
  row: { senderId: string; body: Body; mentions: Mention[]; hereIds?: string[]; system?: unknown; taskEvent?: unknown; commentId?: unknown; broadcast?: unknown },
  channel: { kind: ChannelKind; notifyLevel: NotifyLevel; muted: boolean },
  meId: string,
  prefs: Pick<Preferences, 'keywords' | 'dndUntil' | 'dndSchedule'>,
  now: Date,
  thread: { threadMuted?: boolean } = {},
): boolean {
  if (row.senderId === meId || row.system || channel.muted || channel.notifyLevel === 'none' || dndState(prefs, now)) return false
  // A reply in a thread I muted (slice AA) reaches me only as a mention or keyword would.
  if (channel.notifyLevel === 'all' && !thread.threadMuted) return true
  return reachesMe(row, meId) || (keywordable(row) && matchedKeyword(bodyText(row.body), prefs.keywords) !== null)
}

const NOTE_MAX = 140

/**
 * What a desktop notification says (spec 6.11): the channel ("Thread in #backend" for a reply) and "Name: text", or
 * for a DM the person and the text. One line, at most 140 characters; files alone say so.
 */
export function desktopNote(
  row: { senderId: string; body: Body; attachments: unknown[] },
  reply: boolean,
  channel: { kind: ChannelKind; name: string | null },
  people: Pick<User, 'id' | 'name'>[],
): { title: string; body: string } {
  const who = senderName(row.senderId, people)
  const files = row.attachments.length
  const text = bodyText(row.body).replace(/\s+/g, ' ').trim() || (files === 1 ? 'Sent a file' : files > 1 ? `Sent ${files} files` : '')
  const where = channel.kind === 'channel' ? `#${channel.name ?? ''}` : who
  const line = channel.kind === 'channel' ? `${who}: ${text}` : text
  return {
    title: reply ? `Thread in ${where}` : where,
    body: line.length > NOTE_MAX ? `${line.slice(0, NOTE_MAX - 1).trimEnd()}…` : line,
  }
}
