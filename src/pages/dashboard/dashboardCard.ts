import type { DashboardProject } from '@/api/types'
import { isPastDue } from '@/lib/dates'
import { formatDate, formatHours } from '@/lib/format'

export type CardFacts = { ring: number; hoursLine: string; finishLine: string; late: boolean; over: boolean }

const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** What a dashboard card says about a project: done share, hours against the estimate, and when it should finish. */
export function cardFacts(p: DashboardProject, now: Date): CardFacts {
  const over = p.estimateHours !== null && p.loggedHours > p.estimateHours
  const late = p.status !== 'delivered' && (isPastDue(p.dueDate, now) || p.expectedFinish.slice(0, 10) > p.dueDate.slice(0, 10))
  return {
    ring: Math.round(p.progress * 100),
    hoursLine: p.estimateHours === null ? `${formatHours(p.loggedHours)} · no estimate` : `${formatHours(p.loggedHours)} of ${formatHours(p.estimateHours)}`,
    finishLine: late ? `Expected ${formatDate(p.expectedFinish)} · due ${shortDay(p.dueDate)}` : `Expected ${formatDate(p.expectedFinish)}`,
    late,
    over,
  }
}
