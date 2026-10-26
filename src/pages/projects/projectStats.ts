import type { ProjectSummary } from '@/api/types'
import { isPastDue } from '@/lib/dates'

export type ProjectFilter = 'active' | 'overdue' | 'month' | 'onHold'

/** The project's own due date is over and it isn't delivered. */
export const dueLate = (p: ProjectSummary, now: Date) => p.status !== 'delivered' && isPastDue(p.dueDate, now)

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
