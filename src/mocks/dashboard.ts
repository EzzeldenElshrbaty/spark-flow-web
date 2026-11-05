import type { Api, DashboardProject, WorkingNow } from '@/api/types'
import { entryEnd, entryHours } from '@/lib/hours'
import type { DbData, MockDb } from './db'
import { summarize } from './derive'
import { delay } from './latency'
import { can } from '@/lib/permissions'
import { grantsFor } from './roles'
import { notFound, requireCan, clone } from './shared'

const HOUR = 3_600_000
const WEEK = 7 * 24 * HOUR

/** The projects this viewer runs the dashboard for: all of them with dashboard.all (Admin, Sales), else the ones they manage. */
function inScope(data: DbData, workspaceId: string) {
  if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
  // "Manages a project" means here, in this workspace (as the UI decides it).
  const self = data.users.find((u) => u.id === data.currentUserId)
  const me = requireCan(data, 'dashboard.view', undefined, { managesAny: data.projects.some((p) => p.workspaceId === workspaceId && p.managerId === self?.id) })
  // Archived projects are out of the dashboard (their time stays in the Time & cost report).
  const all = data.projects.filter((p) => p.workspaceId === workspaceId && !p.archivedAt)
  const grants = grantsFor(data, me)
  const managed = all.filter((p) => p.managerId === me.id)
  return { me, grants, managed, projects: can('dashboard.everyProject', { userId: me.id, grants }) ? all : managed }
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
 * working right now. Cost follows summarize(): Admins only. Working now (timer slice 3) lists running timers:
 * checkins.all sees every one on this workspace's projects (Admin), checkins.managed those on projects they manage
 * (PM, Member), and without either none (Sales).
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
          const summary = summarize(p, data, at, { userId: me.id, grants: grantsFor(data, me) })
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
  }
}
