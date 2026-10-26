import type { TaskView, TimeEntry } from '@/api/types'
import { localDay } from '@/lib/dates'
import { entryHours } from '@/lib/hours'
import { myOpenTasks } from '@/pages/projects/taskFilters'

/** "Good morning, Nour": before noon, before 5 PM, then evening. */
export function greeting(now: Date, name: string) {
  const h = now.getHours()
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const first = name.trim().split(/\s+/)[0]
  return first ? `Good ${part}, ${first}` : `Good ${part}`
}

/** Today's hours, the first start and the last end (now while a timer runs). */
export function daySummary(entries: TimeEntry[], now: Date) {
  if (entries.length === 0) return { hours: 0, first: null, last: null }
  const starts = entries.map((e) => e.startedAt).sort()
  const ends = entries.map((e) => e.endedAt ?? now.toISOString()).sort()
  return { hours: entries.reduce((sum, e) => sum + entryHours(e, now), 0), first: starts[0]!, last: ends.at(-1)! }
}

/** My open tasks that are overdue or due today (a due date is stored as that day's UTC midnight), in My tasks' order. */
export const dueTodayOrOverdue = (tasks: TaskView[], userId: string, now: Date) =>
  myOpenTasks(tasks, userId).filter((t) => t.overdue || (t.dueAt !== null && t.dueAt.slice(0, 10) === localDay(now)))
