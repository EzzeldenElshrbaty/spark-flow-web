import clsx from 'clsx'
import { Link } from 'react-router'
import { useCheckedIn, useDashboard } from '@/api/dashboard'
import { useProjectSummaries } from '@/api/projects'
import { useTasksOf } from '@/api/tickets'
import type { CheckedInNow, DashboardProject, User } from '@/api/types'
import { useUsers } from '@/api/users'
import { ProgressRing } from '@/components/charts/ProgressRing'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatHours, formatMoney, formatTime } from '@/lib/format'
import { paths } from '@/lib/paths'
import { useAccess } from '@/lib/usePermission'
import { useNow } from '@/lib/useNow'
import { useRole } from '@/lib/useRole'
import { cardFacts } from './dashboardCard'

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

function CheckedInList({ list, people, taskLabel }: { list: CheckedInNow[]; people: User[]; taskLabel: (taskId: string | null, projectId: string) => string }) {
  if (list.length === 0) return <p className="p-5 text-sm text-fg-muted">No one is checked in right now.</p>
  return (
    <ul className="divide-y divide-line-subtle">
      {list.map((c) => {
        const name = people.find((u) => u.id === c.userId)?.name ?? 'Unknown person'
        return (
          <li key={c.userId} className="flex items-center gap-3 px-5 py-3">
            <Avatar name={name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-fg">
                {name} <span className="text-fg-muted">· since {formatTime(c.since)}</span>
              </span>
              <span className="block truncate text-xs text-fg-muted">{c.running ? taskLabel(c.running.taskId, c.running.projectId) : 'No timer running'}</span>
            </span>
            {c.running && <span className="size-2 shrink-0 rounded-full bg-brand-500 motion-safe:animate-pulse" aria-label="Timer running" />}
          </li>
        )
      })}
    </ul>
  )
}

/** The manager dashboard: every project in scope at a glance, and who is checked in right now. */
export function DashboardPage() {
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const access = useAccess('dashboard.view')
  const allowed = access === 'allowed'
  const projects = useDashboard(workspace?.id, allowed)
  const checkedIn = useCheckedIn(workspace?.id, allowed)
  const people = useUsers(workspace?.id).data ?? []
  // Someone checked in may be working on a project outside this dashboard's scope: name their task from any project.
  const everyProject = useProjectSummaries(workspace?.id).data ?? []
  const runningProjects = [...new Set((checkedIn.data ?? []).flatMap((c) => (c.running ? [c.running.projectId] : [])))]
  const tasks = useTasksOf(runningProjects).data
  const now = useNow(60_000)
  const ws = workspace?.slug ?? ''
  const broad = persona.role === 'admin' || persona.role === 'sales'

  if (access === 'denied') {
    return (
      <>
        <PageHeader title="Dashboard" />
        <p className="text-sm text-fg-secondary">
          You don't have access to the dashboard.{' '}
          <Link to={paths.home(ws)} className="font-medium text-accent hover:text-accent-strong">
            Go to Home
          </Link>
        </p>
      </>
    )
  }

  const list = projects.data ?? []
  const showCost = list.some((p) => p.cost !== null)
  const hours7 = list.reduce((s, p) => s + p.week.reduce((a, w) => a + w.hours, 0), 0)
  const cost = list.reduce((s, p) => s + (p.cost ?? 0), 0)
  const label = (taskId: string | null, projectId: string) => {
    const t = taskId ? tasks.find((x) => x.id === taskId) : undefined
    return t ? `${t.key} · ${t.title}` : (everyProject.find((p) => p.id === projectId)?.name ?? '—')
  }
  const loading = access === 'loading' || projects.isPending

  return (
    <>
      <PageHeader title="Dashboard" subtitle={broad ? `Every project in ${workspace?.name ?? 'this workspace'}.` : 'The projects you manage.'} />
      {projects.isError ? (
        <QueryError what="Dashboard" onRetry={() => void projects.refetch()} />
      ) : loading ? (
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
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Tile label="Active projects" value={String(list.filter((p) => p.status === 'active').length)} sub={`${list.length} in all`} />
            <Tile label="Overdue tasks" value={String(list.reduce((s, p) => s + p.overdueCount, 0))} tone={list.some((p) => p.overdueCount) ? 'danger' : undefined} />
            <Tile label="Hours, last 7 days" value={formatHours(hours7)} />
            {showCost ? (
              <Tile label="Cost to date" value={formatMoney(Math.round(cost))} sub="Hours × hourly cost" />
            ) : (
              <Tile label="Checked in now" value={persona.role === 'sales' ? '—' : String(checkedIn.data?.length ?? 0)} />
            )}
          </div>
          <div className="flex flex-col gap-5 xl:flex-row">
            <div className="grid min-w-0 flex-1 gap-5 lg:grid-cols-2">
              {list.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-fg-secondary lg:col-span-2">No projects to show.</p>
              ) : (
                list.map((p) => <ProjectCard key={p.id} ws={ws} project={p} people={people} now={now} />)
              )}
            </div>
            {persona.role !== 'sales' && (
              <Card className="xl:w-80 xl:shrink-0 xl:self-start">
                <CardHeader title="Checked in now" />
                {checkedIn.isError ? (
                  <div className="p-5">
                    <QueryError what="Check-ins" onRetry={() => void checkedIn.refetch()} />
                  </div>
                ) : checkedIn.isPending ? (
                  <div className="m-5 h-24 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
                ) : (
                  <CheckedInList list={checkedIn.data} people={people} taskLabel={label} />
                )}
              </Card>
            )}
          </div>
        </>
      )}
    </>
  )
}
