import type { DashboardProject } from '@/api/types'
import { formatDate, formatDayMonth, formatHours } from '@/lib/format'
import { behindSchedule } from '@/pages/projects/projectStats'

export type CardFacts = { ring: number; hoursLine: string; finishLine: string; late: boolean; over: boolean }

/** What a dashboard card says about a project: done share, hours against the estimate, and when it should finish. */
export function cardFacts(p: DashboardProject, now: Date): CardFacts {
  // Hours on the estimated tasks against their estimates; time on other tasks (or none) isn't part of the estimate.
  const over = p.estimateHours !== null && p.estimatedLoggedHours > p.estimateHours
  const late = behindSchedule(p, now)
  return {
    ring: Math.round(p.progress * 100),
    hoursLine:
      p.estimateHours === null
        ? `${formatHours(p.loggedHours)} · no estimate`
        : `${formatHours(p.estimatedLoggedHours)} of ${formatHours(p.estimateHours)} estimated · ${formatHours(p.loggedHours)} in all`,
    finishLine: late ? `Expected ${formatDate(p.expectedFinish)} · due ${formatDayMonth(p.dueDate, { utc: true })}` : `Expected ${formatDate(p.expectedFinish)}`,
    late,
    over,
  }
}
