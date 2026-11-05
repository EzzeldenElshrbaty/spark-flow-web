import clsx from 'clsx'
import { Link } from 'react-router'
import { useDashboard, useDashboardStats, useWorkingNow } from '@/api/dashboard'
import { useProjectSummaries } from '@/api/projects'
import { useTasksOf } from '@/api/tickets'
import type { DashboardProject, User, WorkingNow } from '@/api/types'
import { useUsers } from '@/api/users'
import { ProgressRing } from '@/components/charts/ProgressRing'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatClock, formatHours, formatMoney, formatTime } from '@/lib/format'
import { runningClock } from '@/lib/hours'
import { paths } from '@/lib/paths'
import { usePermission } from '@/lib/usePermission'
import { useNow } from '@/lib/useNow'
import { useRole } from '@/lib/useRole'
import { cardFacts } from './dashboardCard'
import { DashboardCharts } from './DashboardCharts'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'danger' }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className={clsx('mt-1 text-xl font-semibold tabular-nums sm:text-2xl', tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-fg')}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-fg-muted">{sub}</p>}
    </div>
  )
}

function ProjectCard({ ws, project, people, now }: { ws: string; project: DashboardProject; people: User[]; now: Date }) {
  const facts = cardFacts(project, now)
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? 'Unknown person'
  const shown = project.week.slice(0, 4)
  const more = project.week.length - shown.length
  return (
    <Link to={paths.project(ws, project.key)} className="block rounded-xl border border-line bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-sm font-semibold text-accent">{initials(project.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-fg">{project.name}</span>
          <span className="block truncate text-xs text-fg-muted">
            <bdi dir="ltr" className="font-mono">{project.key}</bdi> · {project.phaseName ?? (project.status === 'delivered' ? 'Delivered' : '—')}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-fg">{facts.ring}%</span>
          <ProgressRing value={facts.ring} label={`${facts.ring}% done`} />
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-fg-muted">Hours</dt>
          <dd className={clsx('tabular-nums', facts.over ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg')}>{facts.hoursLine}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Finish</dt>
          <dd className={clsx('tabular-nums', facts.late ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg')}>{facts.finishLine}</dd>
        </div>
        {project.cost !== null && (
          <div>
            <dt className="text-xs text-fg-muted">Cost to date</dt>
            <dd className="tabular-nums text-fg">{formatMoney(Math.round(project.cost))}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-fg-muted">Overdue tasks</dt>
          <dd className={clsx('tabular-nums', project.overdueCount ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg')}>{project.overdueCount || '—'}</dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-line-subtle pt-3">
        <p className="text-xs text-fg-muted">Last 7 days</p>
        {shown.length === 0 ? (
          <p className="mt-1 text-sm text-fg-muted">No time logged.</p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap items-center gap-3">
            {shown.map((w) => (
              <li key={w.userId} className="flex items-center gap-1.5 text-sm" title={nameOf(w.userId)}>
                <Avatar name={nameOf(w.userId)} size="sm" />
                <span className="tabular-nums text-fg-secondary">{formatHours(w.hours)}</span>
              </li>
            ))}
            {more > 0 && <li className="text-xs text-fg-muted">+{more}</li>}
          </ul>
        )}
      </div>
    </Link>
  )
}

/** Working now (timer slice 3): who has a timer running on these projects, since when, on what, and its count. */
function WorkingNowList({ list, people, taskLabel }: { list: WorkingNow[]; people: User[]; taskLabel: (taskId: string | null, projectId: string) => string }) {
  const now = useNow(list.length ? 1000 : 0)
  if (list.length === 0) return <p className="p-5 text-sm text-fg-muted">Nobody has a timer running.</p>
  return (
    <ul className="divide-y divide-line-subtle">
      {list.map((w) => {
        const name = people.find((u) => u.id === w.userId)?.name ?? 'Unknown person'
        return (
          <li key={w.userId} className="flex items-center gap-3 px-5 py-3">
            <Avatar name={name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">
                {name} <span className="text-fg-muted">· since {formatTime(w.startedAt)}</span>
              </span>
              <span className="block truncate text-xs text-fg-muted">{taskLabel(w.taskId, w.projectId)}</span>
            </span>
            <span role="timer" className="shrink-0 text-xs tabular-nums text-fg-secondary">
              {formatClock(runningClock(w.startedAt, now).ms)}
            </span>
            <span role="img" className="size-2 shrink-0 rounded-full bg-brand-500 motion-safe:animate-pulse" aria-label="Timer running" />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The dashboard, for everyone (dashboard slice): the projects in my scope (every one with dashboard.everyProject,
 * else the ones I manage or work on) at a glance, their charts and overdue tasks, and who is working on them now.
 */
export function DashboardPage() {
  const { workspace } = useCurrentWorkspace()
  const { persona, grants } = useRole()
  const check = usePermission()
  // Every project, not only the ones I manage or work on (Admin and Sales to start with).
  const broad = check('dashboard.everyProject')
  const everyProject = useProjectSummaries(workspace?.id).data ?? []
  const projects = useDashboard(workspace?.id, true)
  const list = projects.data ?? []
  // Who's working: every timer, or those on projects I manage; Sales neither (spec §1, timer slice 3). Someone who
  // manages none of these projects would only ever see it empty, even with their own timer running, so it's left out.
  const seesWorking = check('checkins.view') && (grants.includes('checkins.all') || list.some((p) => p.managerId === persona.id))
  const stats = useDashboardStats(workspace?.id)
  const working = useWorkingNow(workspace?.id, seesWorking)
  const people = useUsers(workspace?.id).data ?? []
  const runningProjects = [...new Set((working.data ?? []).map((w) => w.projectId))]
  const tasks = useTasksOf(runningProjects).data
  const now = useNow(60_000)
  const ws = workspace?.slug ?? ''

  const showCost = list.some((p) => p.cost !== null)
  const hours7 = list.reduce((s, p) => s + p.week.reduce((a, w) => a + w.hours, 0), 0)
  const cost = list.reduce((s, p) => s + (p.cost ?? 0), 0)
  const projectName = (id: string) => everyProject.find((p) => p.id === id)?.name ?? list.find((p) => p.id === id)?.name ?? '—'
  const label = (taskId: string | null, projectId: string) => {
    const t = taskId ? tasks.find((x) => x.id === taskId) : undefined
    return t ? `${t.key} · ${t.title}` : projectName(projectId)
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle={broad ? `Every project in ${workspace?.name ?? 'this workspace'}.` : 'The projects you manage or work on.'} />
      {projects.isError ? (
        <QueryError what="Dashboard" onRetry={() => void projects.refetch()} />
      ) : projects.isPending ? (
        <div aria-busy="true">
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-muted" />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-xl bg-surface-muted" />
            ))}
          </div>
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-fg-secondary">{broad ? 'No projects to show.' : 'You’re not on any projects yet.'}</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Tile label="Active projects" value={String(list.filter((p) => p.status === 'active').length)} sub={`${list.length} in all`} />
            <Tile label="Overdue tasks" value={String(list.reduce((s, p) => s + p.overdueCount, 0))} tone={list.some((p) => p.overdueCount) ? 'danger' : undefined} />
            <Tile label="Hours, last 7 days" value={formatHours(hours7)} />
            {showCost ? (
              <Tile label="Cost to date" value={formatMoney(Math.round(cost))} sub="Hours × hourly cost" />
            ) : (
              <Tile label="Working now" value={seesWorking ? String(working.data?.length ?? 0) : '—'} />
            )}
          </div>
          {stats.isError ? (
            <div className="mb-6">
              <QueryError what="Charts" onRetry={() => void stats.refetch()} />
            </div>
          ) : stats.isPending ? (
            <div className="mb-6 flex flex-col gap-5 xl:flex-row" aria-hidden>
              <div className="h-72 animate-pulse rounded-xl bg-surface-muted xl:flex-[2]" />
              <div className="h-72 animate-pulse rounded-xl bg-surface-muted xl:flex-1" />
            </div>
          ) : (
            <DashboardCharts stats={stats.data} scope={broad ? 'every project' : 'your projects'} projectName={projectName} people={people} />
          )}
          <div className="flex flex-col gap-5 xl:flex-row">
            <div className="grid min-w-0 flex-1 gap-5 lg:grid-cols-2">
              {list.map((p) => (
                <ProjectCard key={p.id} ws={ws} project={p} people={people} now={now} />
              ))}
            </div>
            {seesWorking && (
              <Card className="xl:w-80 xl:shrink-0 xl:self-start">
                <CardHeader title="Working now" />
                {working.isError ? (
                  <div className="p-5">
                    <QueryError what="Working now" onRetry={() => void working.refetch()} />
                  </div>
                ) : working.isPending ? (
                  <div className="m-5 h-24 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
                ) : (
                  <WorkingNowList list={working.data} people={people} taskLabel={label} />
                )}
              </Card>
            )}
          </div>
        </>
      )}
    </>
  )
}
