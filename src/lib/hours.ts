import type { TimeEntry } from '@/api/types'

const HOUR = 3_600_000

/** An entry's hours; a running entry counts up to now. Shared by the mock server and the pages. */
export function entryHours(entry: Pick<TimeEntry, 'startedAt' | 'endedAt'>, now: Date): number {
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now.getTime()
  return Math.max(0, end - new Date(entry.startedAt).getTime()) / HOUR
}
