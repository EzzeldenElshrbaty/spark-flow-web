import type { EndReason, TimeEntry } from '@/api/types'
import { entryEnd } from '@/lib/hours'
import type { DbData } from './db'

/** Ends a running entry at `at`, or at the 12-hour limit if it ran that long, which is always Flow's doing. */
export function endEntry(entry: TimeEntry, at: Date, reason: EndReason) {
  const end = entryEnd(entry, at)
  entry.endedAt = new Date(end).toISOString()
  entry.endReason = end < at.getTime() ? 'flow' : reason
}

/** Stops the timers running on these tasks (no more time goes on a done task), at `at` or the 12-hour limit; whose they were. */
export function stopTimersOn(data: DbData, taskIds: string[], at: Date): string[] {
  const stopped: string[] = []
  for (const e of data.timeEntries.filter((e) => e.taskId !== null && taskIds.includes(e.taskId) && e.endedAt === null)) {
    endEntry(e, at, 'flow')
    stopped.push(e.userId)
  }
  return stopped
}
