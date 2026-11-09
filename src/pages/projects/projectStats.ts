import type { ProjectSummary } from '@/api/types'
import { isPastDue } from '@/lib/dates'
import { formatDate } from '@/lib/format'

export type ProjectFilter = 'active' | 'overdue' | 'month' | 'onHold'

/** The project's own due date is over and it isn't delivered. */
export const dueLate = (p: ProjectSummary, now: Date) => p.status !== 'delivered' && isPastDue(p.dueDate, now)

/**
 * Behind schedule (UX Phase 3, 3.3): not delivered, and past its due date or expected to finish after it. The one rule
 * the Dashboard cards and the progress bars share.
 */
export const behindSchedule = (p: Pick<ProjectSummary, 'status' | 'dueDate' | 'expectedFinish'>, now: Date) =>
  p.status !== 'delivered' && (isPastDue(p.dueDate, now) || p.expectedFinish.slice(0, 10) > p.dueDate.slice(0, 10))

/** A progress bar's colour: red means late, so on time is grey and done is green. */
export const progressTone = (p: Pick<ProjectSummary, 'status' | 'dueDate' | 'expectedFinish' | 'progress'>, now: Date): 'success' | 'danger' | 'neutral' =>
  p.progress === 1 ? 'success' : behindSchedule(p, now) ? 'danger' : 'neutral'

/** Late (the Overdue tile): a task is overdue, or the project is past its due date and not delivered. */
export const isLate = (p: ProjectSummary, now: Date) => p.overdueCount > 0 || dueLate(p, now)

const sameMonth = (iso: string, now: Date) => {
  const d = new Date(iso)
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

const rules: Record<ProjectFilter, (p: ProjectSummary, now: Date) => boolean> = {
  active: (p) => p.status === 'active',
  overdue: isLate,
  month: (p, now) => p.status !== 'delivered' && sameMonth(p.dueDate, now),
  onHold: (p) => p.status === 'onHold',
}

/** The tile counts and the list a tile filters to (always a new array, safe to sort). */
export function projectStats(projects: ProjectSummary[], now: Date) {
  return {
    counts: Object.fromEntries(Object.entries(rules).map(([key, rule]) => [key, projects.filter((p) => rule(p, now)).length])) as Record<ProjectFilter, number>,
    filter: (filter: ProjectFilter | null) => (filter ? projects.filter((p) => rules[filter](p, now)) : [...projects]),
  }
}

/**
 * The Expected finish tile's line (UX Phase 4, 4.10): "On time" when it's expected to finish the day it's due (no
 * date said twice), else "Due 4 Dec 2026", with " · late" when behind.
 */
export function finishHint(p: Pick<ProjectSummary, 'status' | 'dueDate' | 'expectedFinish'>, now: Date): string {
  // Behind schedule is late, even when it's expected to finish the day it was due (past due: final review).
  const late = behindSchedule(p, now)
  if (!late && p.expectedFinish && p.expectedFinish.slice(0, 10) === p.dueDate.slice(0, 10)) return 'On time'
  return `Due ${formatDate(p.dueDate)}${late ? ' · late' : ''}`
}
