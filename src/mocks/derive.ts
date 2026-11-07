import { rateAt } from '@/lib/rates'
import type { Attachment, Phase, Project, ProjectSummary, Rate, StatusCategory, TaskView, Ticket, TimeEntry } from '@/api/types'
import { categoryOf } from '@/lib/boardColumns'
import { entryHours } from '@/lib/hours'
import { can, type Permission } from '@/lib/permissions'
import { isPastDue } from '@/lib/dates'

// What the server works out and never stores (spec §3). Pure: the same data and `now` always give the same answer.

const HOURS_PER_DAY = 8
const HOUR = 3_600_000

export { entryHours }

export function loggedHours(taskId: string, entries: TimeEntry[], now: Date): number {
  return entries.filter((e) => e.taskId === taskId).reduce((sum, e) => sum + entryHours(e, now), 0)
}

/** Past its due date and not done, or past its estimate. Done is the column's type (the standard board by default). */
export function isOverdue(task: Ticket, logged: number, now: Date, category: StatusCategory = categoryOf({}, task.status)): boolean {
  if (category === 'done') return false
  const late = task.dueAt !== null && isPastDue(task.dueAt, now)
  const over = task.estimateHours !== null && task.estimateHours > 0 && logged > task.estimateHours
  return late || over
}

type Source = { tickets: Ticket[]; timeEntries: TimeEntry[]; phases: Phase[]; rates: Rate[]; projects?: Project[]; attachments?: Attachment[] }

/** The files a task may show, by id, deleted ones left out. A read of many tasks makes it once and hands it to each. */
export function liveFiles(attachments: readonly Attachment[] = []): ReadonlyMap<string, Attachment> {
  return new Map(attachments.filter((a) => !a.deletedAt).map((a) => [a.id, a]))
}

/** A task as read: hours, overdue and its column's type, from its project's board; its files, in its order. */
export function taskView(
  task: Ticket,
  data: Pick<Source, 'timeEntries' | 'projects' | 'attachments'>,
  now: Date,
  project?: Pick<Project, 'board'>,
  files = liveFiles(data.attachments),
): TaskView {
  const logged = loggedHours(task.id, data.timeEntries, now)
  const category = categoryOf(project ?? data.projects?.find((p) => p.id === task.projectId) ?? {}, task.status)
  const attachments = (task.attachmentIds ?? []).flatMap((id) => files.get(id) ?? [])
  return { ...task, loggedHours: logged, overdue: isOverdue(task, logged, now, category), category, attachments }
}

const latest = (...isoTimes: string[]) => isoTimes.reduce((a, b) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b))

export function summarize(project: Project, data: Source, now: Date, viewer: { userId: string; grants: readonly Permission[] }): ProjectSummary {
  // Archived tasks are out of the counts and progress; their time still counts in hours and cost (entries below).
  const files = liveFiles(data.attachments)
  const tasks = data.tickets.filter((t) => t.projectId === project.id && !t.archivedAt).map((t) => taskView(t, data, now, project, files))
  const entries = data.timeEntries.filter((e) => e.projectId === project.id)
  const phases = data.phases.filter((p) => p.projectId === project.id).sort((a, b) => a.order - b.order)
  const openPhases = phases.filter((p) => p.status !== 'done')

  let expectedFinish = openPhases.length ? latest(...openPhases.map((p) => p.dueDate)) : project.dueDate
  if (tasks.some((t) => t.overdue)) {
    const remaining = tasks
      .filter((t) => t.category !== 'done')
      .reduce((sum, t) => sum + Math.max(0, (t.estimateHours ?? 0) - t.loggedHours), 0)
    expectedFinish = latest(expectedFinish, new Date(now.getTime() + (remaining / HOURS_PER_DAY) * 24 * HOUR).toISOString())
  }

  // Each entry at the rate in effect when it started.
  const cost = can('cost.view', viewer) ? entries.reduce((sum, e) => sum + entryHours(e, now) * rateAt(data.rates, e.userId, e.startedAt), 0) : null

  return {
    ...project,
    progress: tasks.length ? tasks.filter((t) => t.category === 'done').length / tasks.length : 0,
    loggedHours: entries.reduce((sum, e) => sum + entryHours(e, now), 0),
    cost,
    expectedFinish,
    currentPhaseId: openPhases[0]?.id ?? null,
    overdueCount: tasks.filter((t) => t.overdue).length,
    taskCount: tasks.length,
  }
}
