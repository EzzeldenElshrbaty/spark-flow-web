import { Link, useSearchParams } from 'react-router'
import type { DashboardStats, StatusCategory, User } from '@/api/types'
import { BarList } from '@/components/charts/BarList'
import { ChartCard } from '@/components/charts/ChartCard'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { Avatar } from '@/components/Avatar'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { hoursLabel } from '@/pages/projects/ticketPills'
import { dayTicks, formatDate, formatHours, formatWeekdayDay } from '@/lib/format'
import { withInspector } from '@/lib/inspector'

// The dashboard's charts and overdue tasks (dashboard slice, spec §4.4): red for the key series, grey for the rest,
// the takeaway in each title. Every figure comes from api.dashboard.stats.

const RED = 'var(--chart-primary)'
const GREY = 'var(--chart-context)'
const STATUS_LABEL: Record<StatusCategory, string> = { todo: 'To do', inProgress: 'In progress', done: 'Done in 14 days' }

const tenth = (hours: number) => Math.round(hours * 10) / 10
/** A stats day ('YYYY-MM-DD') as that local day. */
const dateOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}
const dayTitle = (day: string) => formatWeekdayDay(dateOf(day))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Hours per day for the last 14 days: my own at the base, everyone else's on top. The key series is red (UX Phase 4,
 * 4.6): my own for someone who sees only their projects (`mineFirst`), the team's for whoever sees every project.
 * "You" leaves the legend while my 14 days add up to nothing.
 */
function HoursPerDay({ days, scope, mineFirst }: { days: DashboardStats['days']; scope: string; mineFirst: boolean }) {
  const total = days.reduce((sum, d) => sum + d.hours, 0)
  const mineTotal = days.reduce((sum, d) => sum + d.mine, 0)
  const ticks = dayTicks(days.map((d) => dateOf(d.day)))
  const you = { label: 'You', color: mineFirst ? RED : GREY }
  const others = { label: 'Everyone else', color: mineFirst ? GREY : RED }
  const legend = (mineFirst ? [you, others] : [others, you]).filter((item) => item !== you || mineTotal > 0)
  return (
    <ChartCard
      className="xl:flex-[2]"
      title={`${formatHours(total)} logged in 14 days`}
      subtitle={`Hours per day on ${scope}`}
      legend={legend}
      table={{ columns: ['Day', 'Hours', 'Yours'], rows: days.map((d) => [dayTitle(d.day), formatHours(d.hours), formatHours(d.mine)]) }}
    >
      <ColumnChart
        label="Hours per day"
        series={[
          { key: 'mine', label: 'You', color: you.color },
          { key: 'others', label: 'Everyone else', color: others.color },
        ]}
        columns={days.map((d, index) => ({
          // The day number, with its month on the first column and on each 1st (UX Phase 3, 3.4).
          label: ticks[index]!,
          title: dayTitle(d.day),
          values: { mine: tenth(d.mine), others: tenth(Math.max(0, d.hours - d.mine)) },
          highlight: index === days.length - 1,
        }))}
        format={formatHours}
      />
    </ChartCard>
  )
}

/** Tasks in scope by status: To do and In progress now, and those done in the last 14 days (the key series). */
function TasksByStatus({ byStatus }: { byStatus: DashboardStats['byStatus'] }) {
  const done = byStatus.find((s) => s.category === 'done')?.count ?? 0
  return (
    <ChartCard
      title={`${plural(done, 'task', 'tasks')} done in 14 days`}
      subtitle="Tasks by status"
      table={{ columns: ['Status', 'Tasks'], rows: byStatus.map((s) => [STATUS_LABEL[s.category], s.count]) }}
    >
      <BarList rows={byStatus.map((s) => ({ label: STATUS_LABEL[s.category], value: s.count, display: String(s.count), color: s.category === 'done' ? RED : GREY }))} />
    </ChartCard>
  )
}

/** Hours by project for the last 14 days, most first. */
function HoursByProject({ byProject, projectName }: { byProject: DashboardStats['byProject']; projectName: (id: string) => string }) {
  const top = byProject[0]
  return (
    <ChartCard
      title={top ? `${projectName(top.projectId)} had the most hours` : 'No time logged in 14 days'}
      subtitle="Hours by project, last 14 days"
      table={{ columns: ['Project', 'Hours'], rows: byProject.map((p) => [projectName(p.projectId), formatHours(p.hours)]) }}
    >
      {top ? (
        <BarList rows={byProject.map((p, index) => ({ label: projectName(p.projectId), value: p.hours, display: formatHours(p.hours), color: index === 0 ? RED : GREY }))} />
      ) : (
        <p className="text-sm text-fg-muted">No time logged.</p>
      )}
    </ChartCard>
  )
}

type Overdue = DashboardStats['attention'][number]

/**
 * The tasks that need attention in scope (UX Phase 1, 1.1): overdue ones first, then those over their estimate; each
 * says why. A row (or its key, for the keyboard) opens the task inspector.
 */
function OverdueTasks({ overdue, projectName, people }: { overdue: Overdue[]; projectName: (id: string) => string; people: User[] }) {
  const [params, setParams] = useSearchParams()
  const open = (key: string) => ({ search: withInspector(params, { kind: 'ticket', key }).toString() })
  const nameOf = (id: string | null) => (id ? (people.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
  // Why: "Overdue · 6 Nov" in red and "Over estimate · 21.9 / 6 h" in amber, each on its own line, so both always show.
  const due = (t: Overdue) => (
    <span className="flex flex-col gap-0.5 tabular-nums">
      {t.overdue && t.dueAt && <span className="text-red-600 dark:text-red-400">Overdue · {formatDate(t.dueAt)}</span>}
      {t.overEstimate && <span className="text-amber-700 dark:text-amber-300">Over estimate · {hoursLabel(t.loggedHours, t.estimateHours)}</span>}
    </span>
  )
  const columns: Column<Overdue>[] = [
    {
      id: 'key',
      header: 'Key',
      width: 100,
      cell: (t) => (
        <Link to={open(t.key)} className="font-mono text-xs text-fg-secondary hover:underline">
          {t.key}
        </Link>
      ),
    },
    { id: 'title', header: 'Title', width: 260, cell: (t) => <span className="block truncate font-medium text-fg">{t.title}</span> },
    { id: 'project', header: 'Project', width: 150, cell: (t) => <span className="block truncate text-fg-secondary">{projectName(t.projectId)}</span> },
    {
      id: 'assignee',
      header: 'Assignee',
      width: 170,
      cell: (t) => {
        const name = nameOf(t.assigneeId)
        return name ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={name} size={24} decorative />
            <span className="truncate text-fg-secondary">{name}</span>
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        )
      },
    },
    { id: 'due', header: 'Why', width: 230, cell: (t) => due(t) },
  ]

  return (
    // The Overdue tile leads here (#attention, UX Phase 4, 4.6).
    <section id="attention" className="mb-6 min-w-0 scroll-mt-20" aria-labelledby="dashboard-overdue">
      <h2 id="dashboard-overdue" tabIndex={-1} className="mb-3 text-sm font-semibold text-fg outline-none">
        {overdue.length ? `${plural(overdue.length, 'task needs', 'tasks need')} attention` : 'No tasks need attention'}
      </h2>
      {overdue.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-secondary">Nothing is past its due date or over its estimate.</p>
      ) : (
        <>
          <div className="max-sm:hidden">
            <DataTable columns={columns} rows={overdue} rowKey={(t) => t.taskId} onRowClick={(t) => setParams((prev) => withInspector(prev, { kind: 'ticket', key: t.key }))} storageKey="spark-flow.table.dashboard-overdue" label="Tasks that need attention" />
          </div>
          <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface sm:hidden">
            {overdue.map((t) => (
              <li key={t.taskId}>
                <Link to={open(t.key)} className="block px-4 py-3 active:bg-surface-sunken">
                  <span className="block truncate text-sm text-fg">
                    <bdi dir="ltr" className="font-mono text-xs text-fg-muted">
                      {t.key}
                    </bdi>{' '}
                    {t.title}
                  </span>
                  <span className="block truncate text-xs text-fg-muted">
                    {projectName(t.projectId)} · {nameOf(t.assigneeId) ?? 'No one'}
                  </span>
                  <span className="mt-0.5 block text-xs">{due(t)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * The charts on the dashboard's 2/3 + 1/3 rhythm (the two bar lists stacked), each card as tall as its content, then
 * the overdue tasks full width.
 */
export function DashboardCharts({ stats, scope, projectName, people, mineFirst }: { stats: DashboardStats; scope: string; projectName: (id: string) => string; people: User[]; mineFirst: boolean }) {
  return (
    <>
      <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start">
        <HoursPerDay days={stats.days} scope={scope} mineFirst={mineFirst} />
        <div className="flex min-w-0 flex-col gap-5 xl:flex-1">
          <TasksByStatus byStatus={stats.byStatus} />
          <HoursByProject byProject={stats.byProject} projectName={projectName} />
        </div>
      </div>
      <OverdueTasks overdue={stats.attention} projectName={projectName} people={people} />
    </>
  )
}
