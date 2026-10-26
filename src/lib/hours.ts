import type { TimeEntry } from '@/api/types'

const HOUR = 3_600_000
/** One entry can be up to 12 hours: a manual one is refused past it, a forgotten timer stops counting at it. */
export const MAX_ENTRY_HOURS = 12

/** When an entry ends: its end, or for a running one now, but never more than 12 hours after it started. */
export function entryEnd(entry: Pick<TimeEntry, 'startedAt' | 'endedAt'>, now: Date): number {
  if (entry.endedAt) return new Date(entry.endedAt).getTime()
  return Math.min(now.getTime(), new Date(entry.startedAt).getTime() + MAX_ENTRY_HOURS * HOUR)
}

/** An entry's hours; a running entry counts up to now (at most 12 hours). Shared by the mock server and the pages. */
export function entryHours(entry: Pick<TimeEntry, 'startedAt' | 'endedAt'>, now: Date): number {
  return Math.max(0, entryEnd(entry, now) - new Date(entry.startedAt).getTime()) / HOUR
}
