import type { TimeEntry } from '@/api/types'

const HOUR = 3_600_000
/** One entry can be up to 12 hours: a manual one is refused past it, a forgotten timer stops counting at it. */
export const MAX_ENTRY_HOURS = 12

/** When an entry ends: its end, or for a running one now, but never more than 12 hours after it started. */
export function entryEnd(entry: Pick<TimeEntry, 'startedAt' | 'endedAt'>, now: Date): number {
  if (entry.endedAt) return new Date(entry.endedAt).getTime()
  return Math.min(now.getTime(), new Date(entry.startedAt).getTime() + MAX_ENTRY_HOURS * HOUR)
}

/** A timer entry that was stopped by the 12-hour limit, not by the person: likely forgotten, worth fixing. */
export function capped(entry: Pick<TimeEntry, 'startedAt' | 'endedAt' | 'source'>): boolean {
  return entry.source === 'timer' && entry.endedAt !== null && new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime() === MAX_ENTRY_HOURS * 3_600_000
}

/** A running timer's clock: time since it started, held at 12 hours (where it stops counting), and whether it's there. */
export function runningClock(startedAt: string, now: Date): { ms: number; capped: boolean } {
  const max = MAX_ENTRY_HOURS * HOUR
  const ms = Math.max(0, now.getTime() - new Date(startedAt).getTime())
  return { ms: Math.min(ms, max), capped: ms >= max }
}

/** An entry's hours; a running entry counts up to now (at most 12 hours). Shared by the mock server and the pages. */
export function entryHours(entry: Pick<TimeEntry, 'startedAt' | 'endedAt'>, now: Date): number {
  return Math.max(0, entryEnd(entry, now) - new Date(entry.startedAt).getTime()) / HOUR
}
