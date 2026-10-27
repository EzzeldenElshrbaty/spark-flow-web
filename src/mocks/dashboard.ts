import type { Api, CheckedInNow, DashboardProject } from '@/api/types'
import { localDay } from '@/lib/dates'
import { entryEnd, entryHours } from '@/lib/hours'
import type { DbData, MockDb } from './db'
import { summarize } from './derive'
import { delay } from './latency'
import { notFound, requireCan, clone } from './shared'

const HOUR = 3_600_000
const WEEK = 7 * 24 * HOUR

/** The projects this viewer runs the dashboard for: Admin and Sales all of them, a PM the ones they manage. */
function inScope(data: DbData, workspaceId: string) {
  if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
  // "Manages a project" means here, in this workspace (as the UI decides it).
  const self = data.users.find((u) => u.id === data.currentUserId)
  const me = requireCan(data, 'dashboard.view', undefined, { managesAny: data.projects.some((p) => p.workspaceId === workspaceId && p.managerId === self?.id) })
  // Archived projects are out of the dashboard (their time stays in the Time & cost report).
  const all = data.projects.filter((p) => p.workspaceId === workspaceId && !p.archivedAt)
  return { me, projects: me.role === 'admin' || me.role === 'sales' ? all : all.filter((p) => p.managerId === me.id) }
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
 * The manager dashboard (spec §5): every project in scope with its phase, estimate and last 7 days, and who is
 * checked in right now. Cost follows summarize(): Admins only. Check-ins are shown to managers of the person's
 * projects (spec §1): Admin sees everyone, a PM the people on their projects, Sales nobody.
 */
export function dashboardApi(db: MockDb, now: () => Date): Api['dashboard'] {
  return {
    async projects(workspaceId) {
      await delay()
      const data = await db.read()
      const { me, projects } = inScope(data, workspaceId)
      const at = now()
      return clone(
        projects.map((p): DashboardProject => {
          const summary = summarize(p, data, at, { userId: me.id, role: me.role })
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
            week: lastWeek(data, p.id, at),
          }
        }),
      )
    },

    async checkedIn(workspaceId) {
      await delay()
      const data = await db.read()
      const { me, projects } = inScope(data, workspaceId)
      if (me.role === 'sales') return []
      const team = (projectId: string) => {
        const p = data.projects.find((x) => x.id === projectId)!
        return [p.managerId, ...p.memberIds, ...data.users.filter((u) => u.teamIds.some((t) => p.teamIds.includes(t))).map((u) => u.id)]
      }
      const visible = me.role === 'admin' ? null : new Set(projects.flatMap((p) => team(p.id)))
      const today = localDay(now())
      return clone(
        data.checkIns
          .filter((c) => c.day === today && c.checkedOutAt === null && (!visible || visible.has(c.userId)))
          .sort((a, b) => (a.checkedInAt < b.checkedInAt ? 1 : -1))
          .map((c): CheckedInNow => {
            const running = data.timeEntries.find((e) => e.userId === c.userId && e.endedAt === null)
            // What they're running shows only when it's on a project this dashboard covers.
            const shown = running && (me.role === 'admin' || projects.some((p) => p.id === running.projectId))
            return { userId: c.userId, since: c.checkedInAt, running: shown ? { taskId: running.taskId, projectId: running.projectId, startedAt: running.startedAt } : null }
          }),
      )
    },
  }
}
