import clsx from 'clsx'
import { Download, Wallet } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useArchivedProjects, useProjectSummaries } from '@/api/projects'
import { useTimeReport } from '@/api/time'
import { noteExport } from '@/api/audit'
import type { ReportPeriod, TimeReport, User } from '@/api/types'
import { useUsers } from '@/api/users'
import { ChartCard } from '@/components/charts/ChartCard'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { Avatar } from '@/components/Avatar'
import { DataTable, TableSkeleton, type Column } from '@/components/ui/DataTable'
import { NoAccess } from '@/components/ui/NoAccess'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatCompact, formatDate, formatDayMonth, formatHours, formatMoney } from '@/lib/format'
import { paths } from '@/lib/paths'
import { useAccess } from '@/lib/usePermission'
import { downloadCsv, toCsv } from '@/lib/csv'
import { selectClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { exportDetail, reportRows } from './reportCsv'
import { missingRateLine } from './missingRates'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { StatTile } from '@/components/ui/StatTile'

const periods: [ReportPeriod, string][] = [
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
]
const groupings = [
  ['project', 'By project'],
  ['person', 'By person'],
  ['week', 'By week'],
] as const
type Grouping = (typeof groupings)[number][0]

const money = (n: number) => formatMoney(Math.round(n))
const weekLabel = (iso: string) => formatDayMonth(iso)


function Share({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-muted">
        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tabular-nums text-fg-muted">{pct}%</span>
    </span>
  )
}

function Body({ report, by, ws, people }: { report: TimeReport; by: Grouping; ws: string; people: User[] }) {
  const { workspace } = useCurrentWorkspace()
  // Archived projects keep their hours here, so their names are looked up too.
  const projects = [...(useProjectSummaries(workspace?.id).data ?? []), ...(useArchivedProjects(workspace?.id, true).data ?? [])]
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? 'Unknown person'
  const projectOf = (id: string) => projects.find((p) => p.id === id)

  if (report.totals.hours === 0) return <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-fg-secondary">No time logged in this period.</p>

  if (by === 'project') {
    const cols: Column<TimeReport['byProject'][number]>[] = [
      {
        id: 'project',
        header: 'Project',
        width: 260,
        cell: (r) => {
          const p = projectOf(r.projectId)
          return p ? (
            <Link to={paths.project(ws, p.key, 'time')} className="hover:underline">
              <span className="font-medium text-fg">{p.name}</span> <span className="font-mono text-xs text-fg-muted">{p.key}</span>
            </Link>
          ) : (
            '—'
          )
        },
      },
      { id: 'hours', header: 'Hours', width: 100, align: 'right', cell: (r) => <span className="tabular-nums">{formatHours(r.hours)}</span> },
      { id: 'cost', header: 'Cost', width: 140, align: 'right', cell: (r) => <span className="tabular-nums">{money(r.cost)}</span> },
      { id: 'share', header: 'Share of hours', width: 180, cell: (r) => <Share value={r.hours} total={report.totals.hours} /> },
    ]
    return <DataTable columns={cols} rows={report.byProject} rowKey={(r) => r.projectId} storageKey="spark-flow.table.report-project" label="Hours by project" />
  }

  if (by === 'person') {
    const cols: Column<TimeReport['byPerson'][number]>[] = [
      {
        id: 'person',
        header: 'Person',
        width: 240,
        cell: (r) => (
          <span className="flex items-center gap-2">
            <Avatar name={nameOf(r.userId)} size={24} decorative />
            <span className="truncate text-fg">{nameOf(r.userId)}</span>
          </span>
        ),
      },
      { id: 'rate', header: 'Hourly cost', width: 130, align: 'right', cell: (r) => <span className="tabular-nums text-fg-secondary">{r.rate ? money(r.rate) : '—'}</span> },
      { id: 'hours', header: 'Hours', width: 100, align: 'right', cell: (r) => <span className="tabular-nums">{formatHours(r.hours)}</span> },
      { id: 'cost', header: 'Cost', width: 140, align: 'right', cell: (r) => <span className="tabular-nums">{money(r.cost)}</span> },
    ]
    return <DataTable columns={cols} rows={report.byPerson} rowKey={(r) => r.userId} storageKey="spark-flow.table.report-person" label="Hours by person" />
  }

  const peak = report.byWeek.reduce((a, b) => (b.hours > a.hours ? b : a), report.byWeek[0]!)
  return (
    <ChartCard
      title={`The week of ${weekLabel(peak.weekStart)} had the most hours`}
      subtitle="Hours per week, Sunday to Saturday"
      legend={[{ label: 'Hours', color: 'var(--chart-primary)', kind: 'bar' }]}
      table={{ columns: ['Week of', 'Hours', 'Cost'], rows: report.byWeek.map((w) => [formatDate(w.weekStart), formatHours(w.hours), money(w.cost)]) }}
    >
      <ColumnChart
        label="Hours per week"
        series={[{ key: 'hours', label: 'Hours', color: 'var(--chart-primary)' }]}
        columns={report.byWeek.map((w) => ({ label: weekLabel(w.weekStart), title: `Week of ${formatDate(w.weekStart)}`, values: { hours: Math.round(w.hours * 10) / 10 }, highlight: w === peak }))}
        format={(v) => formatHours(v)}
      />
    </ChartCard>
  )
}

/** Time & cost (Admin only): hours and what they cost, by project, person and week, for the last 7, 30 or 90 days. */
export function TimeCostPage() {
  const { workspace } = useCurrentWorkspace()
  const ws = workspace?.slug ?? ''
  const access = useAccess('timeCost.view')
  const [params, setParams] = useSearchParams()
  const days = ([7, 30, 90] as const).find((d) => String(d) === params.get('days')) ?? 30
  const by: Grouping = groupings.some(([g]) => g === params.get('by')) ? (params.get('by') as Grouping) : 'project'
  const projectId = params.get('project') ?? ''
  const report = useTimeReport(workspace?.id, days, access === 'allowed', projectId || undefined)
  const people = useUsers(workspace?.id).data ?? []
  const allProjects = [...(useProjectSummaries(workspace?.id).data ?? []), ...(useArchivedProjects(workspace?.id, true).data ?? [])]
  const set = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      // A choice is a step Back undoes (UX Phase 2, 2.7).
      { replace: false },
    )
  // The table on screen as a CSV file.
  const exportCsv = () => {
    if (!report.data) return
    const names = { project: (id: string) => allProjects.find((p) => p.id === id)?.name ?? 'Unknown project', person: (id: string) => people.find((u) => u.id === id)?.name ?? 'Unknown person' }
    downloadCsv(`time-${by}-${days}d.csv`, toCsv(reportRows(report.data, by, names)))
    // What the file held, for the audit log (slice 2): "30 days · By project · All projects".
    noteExport('timeCost', exportDetail(days, groupings.find(([g]) => g === by)![1], projectId ? names.project(projectId) : null))
  }

  const header = (
    <PageHeader
      title="Time & cost"
      subtitle="Hours logged and what they cost, by project, person and week."
      actions={
        access === 'allowed' ? (
          <Link to={paths.rates(ws)} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm font-medium text-fg ring-1 ring-line hover:bg-surface-sunken">
            <Wallet className="size-4" /> Edit hourly costs
          </Link>
        ) : undefined
      }
    />
  )

  if (access === 'denied') {
    return (
      <>
        <PageHeader title="Time & cost" />
        <NoAccess ws={ws} what="time and cost" />
      </>
    )
  }

  const r = report.data
  return (
    <>
      {header}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl label="Period" value={String(days)} onChange={(value) => set('days', value)} options={periods.map(([value, label]) => ({ value: String(value), label }))} />
        <select className={`${selectClass} w-auto`} aria-label="Project" value={projectId} onChange={(e) => set('project', e.target.value)}>
          <option value="">All projects</option>
          {allProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={exportCsv} disabled={!report.data}>
          <Download className="size-4" /> Export CSV
        </Button>
      </div>
      {(() => {
        // People with no hourly cost count 0 EGP: say so, with the way to set them.
        const missing = report.data ? missingRateLine(report.data.byPerson) : null
        return missing ? (
          <p className="mb-4 text-sm text-amber-700 dark:text-amber-300">
            {missing.text} ·{' '}
            <Link to={paths.rates(ws)} className="font-medium underline">
              {missing.action}
            </Link>
          </p>
        ) : null
      })()}
      {report.isError ? (
        <QueryError what="Time and cost" onRetry={() => void report.refetch()} />
      ) : !r ? (
        <div aria-busy="true">
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-muted" />
            ))}
          </div>
          <TableSkeleton rows={5} />
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatTile label="Hours" value={formatHours(r.totals.hours)} />
            <StatTile label="Cost" value={formatCompact(Math.round(r.totals.cost))} />
            <StatTile label="Average cost per hour" value={r.totals.hours ? money(r.totals.cost / r.totals.hours) : '—'} />
            <StatTile label="People who logged time" value={String(r.totals.people)} />
          </div>
          <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Group by">
            {groupings.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={by === value}
                onClick={() => set('by', value)}
                className={clsx(
                  'relative flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                  "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-200 after:content-['']",
                  by === value ? 'text-fg after:scale-x-100' : 'text-fg-muted after:scale-x-0 hover:text-fg',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Body report={r} by={by} ws={ws} people={people} />
        </>
      )}
    </>
  )
}
