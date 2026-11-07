import type { Api, DashboardProject, DashboardStats, Project, StatusCategory, Ticket, WorkingNow } from '@/api/types'
import { categoryOf } from '@/lib/boardColumns'
import { localDay } from '@/lib/dates'
import { entryEnd, entryHours } from '@/lib/hours'
import { projectPeople } from '@/lib/projectPeople'
import type { DbData, MockDb } from './db'
import { liveFiles, summarize, taskView } from './derive'
import { delay } from './latency'
import { can } from '@/lib/permissions'
import { grantsFor } from './roles'
import { notFound, requireCan, clone } from './shared'

const HOUR = 3_600_000
const WEEK = 7 * 24 * HOUR
/** How far back the charts look. */
const STATS_DAYS = 14
const CATEGORIES: StatusCategory[] = ['todo', 'inProgress', 'done']

/**
 * The projects this viewer's dashboard covers (dashboard slice): every active one with dashboard.all (Admin, Sales),
 * else the ones they manage or are on, as a member or through a team. `managed` is kept apart for Working now.
 */
function inScope(data: DbData, workspaceId: string) {
  if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
  const me = requireCan(data, 'dashboard.view')
  // Archived projects are out of the dashboard (their time stays in the Time & cost report).
  const all = data.projects.filter((p) => p.workspaceId === workspaceId && !p.archivedAt)
  const grants = grantsFor(data, me)
  const managed = all.filter((p) => p.managerId === me.id)
  const mine = all.filter((p) => projectPeople(p, [me]).length > 0)
  return { me, grants, managed, projects: can('dashboard.everyProject', { userId: me.id, grants }) ? all : mine }
}

/** The last 14 local days, oldest first, each with its bounds in ms. */
function lastDays(now: Date) {
  return Array.from({ length: STATS_DAYS }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (STATS_DAYS - 1 - i))
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    return { day: localDay(start), start: start.getTime(), end: end.getTime() }
  })
}

/**
 * When a task reached the column it is in: its newest move there in the project's history, or, with none, when it
 * was made (a task made in that column has been there since).
 */
function inColumnSince(data: DbData, task: Ticket): string {
  for (let i = data.activity.length - 1; i >= 0; i--) {
    const line = data.activity[i]
    if (line.projectId === task.projectId && line.taskKey === task.key && line.kind === 'task.moved' && line.changes.some((c) => c.field === 'status' && c.to === task.status)) return line.at
  }
  return task.createdAt
}

/** The dashboard's charts and overdue tasks over `projects`; `meId`'s own hours are `mine`. */
function statsOf(data: DbData, projects: Project[], meId: string, now: Date): DashboardStats {
  const ids = new Set(projects.map((p) => p.id))
  const days = lastDays(now).map((d) => ({ ...d, hours: 0, mine: 0 }))
  const byProject = new Map<string, number>()
  const from = days[0].start
  for (const e of data.timeEntries) {
    if (!ids.has(e.projectId)) continue
    const start = new Date(e.startedAt).getTime()
    const end = Math.min(entryEnd(e, now), now.getTime())
    if (end <= from) continue
    for (const d of days) {
      const part = (Math.min(end, d.end) - Math.max(start, d.start)) / HOUR
      if (part <= 0) continue
      d.hours += part
      if (e.userId === meId) d.mine += part
      byProject.set(e.projectId, (byProject.get(e.projectId) ?? 0) + part)
    }
  }

  const tasks = data.tickets.filter((t) => ids.has(t.projectId) && !t.archivedAt)
  const projectOf = new Map(projects.map((p) => [p.id, p]))
  const counts = new Map<StatusCategory, number>(CATEGORIES.map((c) => [c, 0]))
  const recent = new Date(from).toISOString()
  for (const t of tasks) {
    const category = categoryOf(projectOf.get(t.projectId)!, t.status)
    if (category === 'done' && inColumnSince(data, t) < recent) continue
    counts.set(category, counts.get(category)! + 1)
  }

  const files = liveFiles(data.attachments)
  const overdue = tasks
    .filter((t) => taskView(t, data, now, projectOf.get(t.projectId), files).overdue)
    // Due soonest first; over its estimate with no due date last.
    .sort((a, b) => (a.dueAt ?? '\uffff').localeCompare(b.dueAt ?? '\uffff') || a.key.localeCompare(b.key))
    .map((t) => ({ taskId: t.id, key: t.key, title: t.title, projectId: t.projectId, assigneeId: t.assigneeId, dueAt: t.dueAt }))

  return {
    days: days.map(({ day, hours, mine }) => ({ day, hours, mine })),
    byProject: [...byProject].map(([projectId, hours]) => ({ projectId, hours })).filter((p) => p.hours > 0).sort((a, b) => b.hours - a.hours),
    byStatus: CATEGORIES.map((category) => ({ category, count: counts.get(category)! })),
    overdue,
  }
}

/** Hours per person on a project in the last 7 days (each entry clipped to the window), most first. */
function lastWeek(data: DbData, projectId: string, now: Date) {
  const from = now.getTime() - WEEK
  const hours = new Map<string, number>()
  for (const e of data.timeEntries) {
    if (e.projectId !== projectId) continue
    const part = Math.min(entryEnd(e, now), now.getTime()) - Math.max(new Date(e.startedAt).getTime(), from)
    if (part > 0) hours.set(e.userId, (hours.get(e.userId) ?? 0) + part / HOUR)
  }
  return [...hours]
    // Unrounded, so the 7-day tile adds up; the page rounds when it shows them.
    .map(([userId, h]) => ({ userId, hours: h }))
    .filter((w) => w.hours > 0)
    .sort((a, b) => b.hours - a.hours)
}

/**
 * The dashboard (spec §5, dashboard slice): every project in scope with its phase, estimate and last 7 days, the
 * charts and overdue tasks (`stats`), and who is working right now. Cost follows summarize(): Admins only. Working now (timer slice 3) lists running timers:
 * checkins.all sees every one on this workspace's projects (Admin), checkins.managed those on projects they manage
 * (PM, Member), and without either none (Sales).
 */
export function dashboardApi(db: MockDb, now: () => Date): Api['dashboard'] {
  return {
    async projects(workspaceId) {
      await delay()
      const data = await db.read()
      const { me, grants, projects } = inScope(data, workspaceId)
      const at = now()
      const everyProject = can('dashboard.everyProject', { userId: me.id, grants })
      return clone(
        projects.map((p): DashboardProject => {
          const summary = summarize(p, data, at, { userId: me.id, grants })
          const week = lastWeek(data, p.id, at)
          // Others' hours by name, as on the project's Time tab: its manager, whoever sees everyone's time, and (as
          // before the dashboard opened to everyone) whoever has it for every project.
          const seesTeam = everyProject || can('time.seeTeam', { userId: me.id, grants, project: p })
          const tasks = data.tickets.filter((t) => t.projectId === p.id && !t.archivedAt)
          const estimated = tasks.filter((t) => t.estimateHours !== null)
          return {
            ...summary,
            phaseName: data.phases.find((ph) => ph.id === summary.currentPhaseId)?.name ?? null,
            estimateHours: estimated.length ? estimated.reduce((s, t) => s + (t.estimateHours ?? 0), 0) : null,
            // Like with like: only time on those same tasks counts against their estimates.
            estimatedLoggedHours: data.timeEntries
              .filter((e) => e.taskId !== null && estimated.some((t) => t.id === e.taskId))
              .reduce((s, e) => s + entryHours(e, at), 0),
            week: seesTeam ? week : week.filter((w) => w.userId === me.id),
            weekHours: week.reduce((s, w) => s + w.hours, 0),
          }
        }),
      )
    },

    async workingNow(workspaceId) {
      await delay()
      const data = await db.read()
      const { me, grants, managed } = inScope(data, workspaceId)
      if (!can('checkins.view', { userId: me.id, grants })) return []
      // A timer on a project the viewer doesn't manage stays theirs to see only with checkins.all.
      const everyone = grants.includes('checkins.all')
      const shown = new Set((everyone ? data.projects.filter((p) => p.workspaceId === workspaceId && !p.archivedAt) : managed).map((p) => p.id))
      return clone(
        data.timeEntries
          .filter((e) => e.endedAt === null && shown.has(e.projectId))
          .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
          .map((e): WorkingNow => ({ userId: e.userId, taskId: e.taskId, projectId: e.projectId, startedAt: e.startedAt })),
      )
    },

    async stats(workspaceId) {
      await delay()
      const data = await db.read()
      const { me, projects } = inScope(data, workspaceId)
      return clone(statsOf(data, projects, me.id, now()))
    },
  }
}
