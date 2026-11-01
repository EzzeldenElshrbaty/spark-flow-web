import { entryEnd } from '@/lib/hours'
import type { DbData } from './db'

/** Stops the timers running on these tasks (no more time goes on a done task), at `at` or the 12-hour limit; whose they were. */
export function stopTimersOn(data: DbData, taskIds: string[], at: Date): string[] {
  const stopped: string[] = []
  for (const e of data.timeEntries.filter((e) => e.taskId !== null && taskIds.includes(e.taskId) && e.endedAt === null)) {
    e.endedAt = new Date(entryEnd(e, at)).toISOString()
    stopped.push(e.userId)
  }
  return stopped
}
