import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useArchivedProjects, usePhases, useProjectSummaries } from '@/api/projects'
import type { ProjectSummary } from '@/api/types'
import { useUsers } from '@/api/users'
import { Button } from '@/components/ui/Button'
import { DataTable, TableSkeleton, type Column } from '@/components/ui/DataTable'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatDate, formatMoney } from '@/lib/format'
import { paths } from '@/lib/paths'
import { columnSortFrom, sortByColumn, sortParams, type SortKeys } from '@/lib/sorting'
import { usePermission } from '@/lib/usePermission'
import { ProjectSheet } from './ProjectSheet'
import { dueLate, projectStats, type ProjectFilter } from './projectStats'

const tiles: [ProjectFilter, string][] = [
  ['active', 'Active'],
  ['overdue', 'Overdue'],
  ['month', 'Due this month'],
  ['onHold', 'On hold'],
]
const isFilter = (value: string | null): value is ProjectFilter => tiles.some(([key]) => key === value)

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

function Logo({ name }: { name: string }) {
  return <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-xs font-semibold text-accent">{initials(name)}</span>
}

function PhaseName({ project }: { project: ProjectSummary }) {
  const phases = usePhases(project.id).data ?? []
  const current = phases.find((p) => p.id === project.currentPhaseId)
  return <span className="text-fg-secondary">{current?.name ?? (project.status === 'delivered' ? 'Delivered' : '—')}</span>
}

const hours = (h: number) => `${Math.round(h * 10) / 10}h`

/** Every project in the workspace: four tiles that filter, then the table (a compact list on phones). */
export function ProjectsPage() {
  const { workspace } = useCurrentWorkspace()
  const ws = workspace?.slug ?? ''
  const projects = useProjectSummaries(workspace?.id)
  const people = useUsers(workspace?.id).data ?? []
  const check = usePermission()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filter = isFilter(params.get('show')) ? (params.get('show') as ProjectFilter) : null
  const creating = params.get('new') === '1' && check('project.create')
  // Archived projects are out of the list and the tiles; Show archived lists only them.
  const showArchived = params.get('archived') === '1'
  const archived = useArchivedProjects(workspace?.id, showArchived)

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  const now = useMemo(() => new Date(), [])
  const list = projects.data ?? []
  const stats = projectStats(list, now)
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? '—'
  const sort = columnSortFrom(params)
  const sortKeys: SortKeys<ProjectSummary> = {
    name: (p) => p.name,
    client: (p) => p.clientName,
    manager: (p) => nameOf(p.managerId),
    due: (p) => p.dueDate,
    progress: (p) => p.progress,
    hours: (p) => p.loggedHours,
    cost: (p) => p.cost,
    overdue: (p) => p.overdueCount,
  }
  const rows = showArchived ? sortByColumn(archived.data ?? [], sort, sortKeys) : sortByColumn(stats.filter(filter), sort, sortKeys)
  const showCost = list.some((p) => p.cost !== null)
  const open = (p: ProjectSummary) => navigate(paths.project(ws, p.key))

  const columns: Column<ProjectSummary>[] = [
    {
      id: 'name',
      header: 'Project',
      width: 260,
      sort: 'text',
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-3">
          <Logo name={p.name} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">{p.name}</span>
            <span className="block font-mono text-xs text-fg-muted">
              {p.key}
              {p.archivedAt && <span className="ms-2 rounded-full bg-surface-muted px-2 py-0.5 font-sans text-fg-secondary">Archived</span>}
            </span>
          </span>
        </span>
      ),
    },
    { id: 'client', header: 'Client', width: 160, sort: 'text', cell: (p) => <span className="text-fg-secondary">{p.clientName.trim() || '—'}</span> },
    { id: 'manager', header: 'Manager', width: 160, sort: 'text', cell: (p) => <span className="text-fg-secondary">{nameOf(p.managerId)}</span> },
    { id: 'phase', header: 'Phase', width: 140, cell: (p) => <PhaseName project={p} /> },
    {
      id: 'due',
      header: 'Due',
      width: 120,
      sort: 'date',
      cell: (p) => <span className={clsx('tabular-nums', dueLate(p, now) ? 'text-red-600 dark:text-red-400' : 'text-fg-secondary')}>{formatDate(p.dueDate)}</span>,
    },
    {
      id: 'progress',
      header: 'Progress',
      width: 150,
      sort: 'number',
      cell: (p) => (
        <span className="flex items-center gap-2">
          <span className="w-20">
            <ProgressBar value={p.progress * 100} tone={p.progress === 1 ? 'success' : 'brand'} />
          </span>
          <span className="text-xs tabular-nums text-fg-muted">{Math.round(p.progress * 100)}%</span>
        </span>
      ),
    },
    { id: 'hours', header: 'Hours', width: 90, align: 'right', sort: 'number', cell: (p) => <span className="tabular-nums text-fg-secondary">{hours(p.loggedHours)}</span> },
    ...(showCost
      ? [{ id: 'cost', header: 'Cost', width: 120, align: 'right' as const, sort: 'number' as const, cell: (p: ProjectSummary) => <span className="tabular-nums text-fg-secondary">{p.cost === null ? '—' : formatMoney(p.cost)}</span> }]
      : []),
    {
      id: 'overdue',
      header: 'Overdue',
      width: 100,
      align: 'right',
      sort: 'number',
      cell: (p) => <span className={clsx('tabular-nums', p.overdueCount ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg-muted')}>{p.overdueCount || '—'}</span>,
    },
  ]

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`Every project in ${workspace?.name ?? 'this workspace'}.`}
        actions={
          check('project.create') ? (
            <Button onClick={() => setParam('new', '1')}>
              <Plus className="size-4" /> New project
            </Button>
          ) : undefined
        }
      />

      {projects.isError ? (
        <QueryError what="Projects" onRetry={() => void projects.refetch()} />
      ) : projects.isPending ? (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
            {tiles.map(([key]) => (
              <div key={key} className="h-20 animate-pulse rounded-xl bg-surface-muted" />
            ))}
          </div>
          <TableSkeleton />
        </>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setParam('show', filter === key ? null : key)}
                className={clsx(
                  'rounded-xl border bg-surface p-4 text-start transition-colors hover:border-line-strong',
                  filter === key ? 'border-accent ring-1 ring-accent' : 'border-line',
                )}
              >
                <span className="block text-sm text-fg-muted">{label}</span>
                <span className={clsx('mt-1 block text-2xl font-semibold tabular-nums', key === 'overdue' && stats.counts.overdue ? 'text-red-600 dark:text-red-400' : 'text-fg')}>
                  {stats.counts[key]}
                </span>
              </button>
            ))}
          </div>

          <div className="mb-4 flex">
            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => setParam('archived', showArchived ? null : '1')}
              className={clsx('rounded-full border px-3 py-1.5 text-sm', showArchived ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-secondary hover:bg-surface-muted')}
            >
              Show archived
            </button>
          </div>

          {showArchived && archived.isPending ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong p-10 text-center">
              <p className="text-sm text-fg-secondary">{showArchived ? 'No archived projects.' : filter ? 'No projects match this filter.' : 'No projects yet.'}</p>
              {filter ? (
                <button type="button" onClick={() => setParam('show', null)} className="mt-2 text-sm font-medium text-accent hover:text-accent-strong">
                  Show all projects
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="max-sm:hidden">
                <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} onRowClick={open} sort={sort} onSort={(next) => setParams((prev) => { const out = new URLSearchParams(prev); for (const [k, v] of Object.entries(sortParams(next))) { if (v) out.set(k, v); else out.delete(k) } return out }, { replace: true })} storageKey="spark-flow.table.projects" label="Projects" />
              </div>
              <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface sm:hidden">
                {rows.map((p) => (
                  <li key={p.id}>
                    <Link to={paths.project(ws, p.key)} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                      <Logo name={p.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-fg">{p.name}</span>
                        <span className="block truncate text-xs text-fg-muted">
                          {p.key} · {p.clientName.trim() || '—'} · {Math.round(p.progress * 100)}%
                        </span>
                      </span>
                      <span className={clsx('text-xs tabular-nums', dueLate(p, now) ? 'text-red-600 dark:text-red-400' : 'text-fg-muted')}>{formatDate(p.dueDate)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {creating && workspace && (
        <ProjectSheet
          workspaceId={workspace.id}
          takenKeys={list.map((p) => p.key)}
          onClose={() => setParam('new', null)}
          onSaved={(project) => {
            // Drop ?new first, so Back from the new project returns to the list, not to an empty form.
            setParam('new', null)
            navigate(paths.project(ws, project.key))
          }}
        />
      )}
    </>
  )
}
