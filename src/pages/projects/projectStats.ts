import type { ProjectSummary } from '@/api/types'

export type ProjectFilter = 'active' | 'overdue' | 'month' | 'delivered'

/** Late: a task is overdue, or the project is past its due date and not delivered. */
export const isLate = (p: ProjectSummary, now: Date) => p.overdueCount > 0 || (p.status !== 'delivered' && new Date(p.dueDate) < now)

const sameMonth = (iso: string, now: Date) => {
  const d = new Date(iso)
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

const rules: Record<ProjectFilter, (p: ProjectSummary, now: Date) => boolean> = {
  active: (p) => p.status === 'active',
  overdue: isLate,
  month: (p, now) => p.status !== 'delivered' && sameMonth(p.dueDate, now),
  delivered: (p) => p.status === 'delivered',
}

/** The tile counts and the list a tile filters to (always a new array, safe to sort). */
export function projectStats(projects: ProjectSummary[], now: Date) {
  return {
    counts: Object.fromEntries(Object.entries(rules).map(([key, rule]) => [key, projects.filter((p) => rule(p, now)).length])) as Record<ProjectFilter, number>,
    filter: (filter: ProjectFilter | null) => (filter ? projects.filter((p) => rules[filter](p, now)) : [...projects]),
  }
}
