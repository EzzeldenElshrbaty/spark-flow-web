import type { Phase, Project, ProjectSummary, Rate, Role, TaskView, Ticket, TimeEntry } from '@/api/types'
import { entryHours } from '@/lib/hours'
import { can } from '@/lib/permissions'

// What the server works out and never stores (spec §3). Pure: the same data and `now` always give the same answer.

const HOURS_PER_DAY = 8
const HOUR = 3_600_000

export { entryHours }

export function loggedHours(taskId: string, entries: TimeEntry[], now: Date): number {
  return entries.filter((e) => e.taskId === taskId).reduce((sum, e) => sum + entryHours(e, now), 0)
}

/** Past its due date and not done, or past its estimate. */
export function isOverdue(task: Ticket, logged: number, now: Date): boolean {
  if (task.status === 'done') return false
  const late = task.dueAt !== null && new Date(task.dueAt).getTime() < now.getTime()
  const over = task.estimateHours !== null && task.estimateHours > 0 && logged > task.estimateHours
  return late || over
}

type Source = { tickets: Ticket[]; timeEntries: TimeEntry[]; phases: Phase[]; rates: Rate[] }

export function taskView(task: Ticket, data: Pick<Source, 'timeEntries'>, now: Date): TaskView {
  const logged = loggedHours(task.id, data.timeEntries, now)
  return { ...task, loggedHours: logged, overdue: isOverdue(task, logged, now) }
}

const latest = (...isoTimes: string[]) => isoTimes.reduce((a, b) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b))

export function summarize(project: Project, data: Source, now: Date, viewer: { userId: string; role: Role }): ProjectSummary {
  const tasks = data.tickets.filter((t) => t.projectId === project.id).map((t) => taskView(t, data, now))
  const entries = data.timeEntries.filter((e) => e.projectId === project.id)
  const phases = data.phases.filter((p) => p.projectId === project.id).sort((a, b) => a.order - b.order)
  const openPhases = phases.filter((p) => p.status !== 'done')

  let expectedFinish = openPhases.length ? latest(...openPhases.map((p) => p.dueDate)) : project.dueDate
  if (tasks.some((t) => t.overdue)) {
    const remaining = tasks
      .filter((t) => t.status !== 'done')
      .reduce((sum, t) => sum + Math.max(0, (t.estimateHours ?? 0) - t.loggedHours), 0)
    expectedFinish = latest(expectedFinish, new Date(now.getTime() + (remaining / HOURS_PER_DAY) * 24 * HOUR).toISOString())
  }

  const rateOf = new Map(data.rates.map((r) => [r.userId, r.hourlyCost]))
  const cost = can('cost.view', viewer) ? entries.reduce((sum, e) => sum + entryHours(e, now) * (rateOf.get(e.userId) ?? 0), 0) : null

  return {
    ...project,
    progress: tasks.length ? tasks.filter((t) => t.status === 'done').length / tasks.length : 0,
    loggedHours: entries.reduce((sum, e) => sum + entryHours(e, now), 0),
    cost,
    expectedFinish,
    currentPhaseId: openPhases[0]?.id ?? null,
    overdueCount: tasks.filter((t) => t.overdue).length,
    taskCount: tasks.length,
  }
}
