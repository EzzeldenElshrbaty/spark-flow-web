import clsx from 'clsx'
import { AlertTriangle, CalendarClock, FolderKanban, PauseCircle, Plus, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useArchivedProjects, usePhases, useProjectSummaries } from '@/api/projects'
import type { ProjectSummary } from '@/api/types'
import { useUsers } from '@/api/users'
import { Button } from '@/components/ui/Button'
import { DataTable, TableSkeleton, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { FilterTile } from '@/components/ui/FilterTile'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { QueryError } from '@/components/ui/QueryError'
import { SearchBox } from '@/components/ui/SearchBox'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatDate, formatMoney } from '@/lib/format'
import { paths } from '@/lib/paths'
import { columnSortFrom, sortByColumn, sortParams, type SortKeys } from '@/lib/sorting'
import { usePermission } from '@/lib/usePermission'
import { ProjectSheet } from './ProjectSheet'
import { dueLate, progressTone, projectStats, type ProjectFilter } from './projectStats'
import { useParamState } from '@/lib/searchParams'

// The kit's attention tiles (UX Phase 4, 4.2): red for late, sky for due soon, amber for waiting.
const tiles: [ProjectFilter, string, LucideIcon, 'red' | 'amber' | 'sky' | 'neutral'][] = [
  ['active', 'Active', FolderKanban, 'neutral'],
  ['overdue', 'Overdue', AlertTriangle, 'red'],
  ['month', 'Due this month', CalendarClock, 'sky'],
  ['onHold', 'On hold', PauseCircle, 'amber'],
]

/** A project matches the search by its name, key or client, any case. */
const matches = (p: ProjectSummary, words: string) => !words || [p.name, p.key, p.clientName].some((text) => text.toLowerCase().includes(words))
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
  // Typing replaces the history entry; a tile, Show archived or opening New project is a step Back undoes (UX Phase 2, 2.7).
  const [, set] = useParamState({ typed: ['q'], sheets: ['new'] })
  const words = params.get('q')?.trim().toLowerCase() ?? ''
  const filter = isFilter(params.get('show')) ? (params.get('show') as ProjectFilter) : null
  const creating = params.get('new') === '1' && check('project.create')
  // Archived projects are out of the list and the tiles; Show archived lists only them.
  const showArchived = params.get('archived') === '1'
  const archived = useArchivedProjects(workspace?.id, showArchived)

  const setParam = (key: string, value: string | null) => set({ [key]: value })

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
  const pool = showArchived ? (archived.data ?? []) : stats.filter(filter)
  const rows = sortByColumn(pool.filter((p) => matches(p, words)), sort, sortKeys)
  const total = showArchived ? (archived.data ?? []).length : list.length
  const active = Number(Boolean(filter) && !showArchived) + Number(Boolean(words))
  const clear = () => set({ show: null, q: null })
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
            {/* A link, so the keyboard opens a project too (UX Phase 5A, 5.6). */}
            <Link to={paths.project(ws, p.key)} className="block truncate font-medium text-fg hover:underline">
              {p.name}
            </Link>
            <span className="block font-mono text-xs text-fg-muted">
              {p.key}
              {p.archivedAt && <span className="ms-2 rounded-full bg-surface-muted px-2 py-0.5 font-sans text-fg-secondary">Archived</span>}
            </span>
          </span>
        </span>
      ),
    },
    { id: 'client', header: 'Client', width: 160, dropOrder: 1, sort: 'text', cell: (p) => <span className="text-fg-secondary">{p.clientName.trim() || '—'}</span> },
    { id: 'manager', header: 'Manager', width: 160, dropOrder: 2, sort: 'text', cell: (p) => <span className="text-fg-secondary">{nameOf(p.managerId)}</span> },
    { id: 'phase', header: 'Phase', width: 140, dropOrder: 3, cell: (p) => <PhaseName project={p} /> },
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
            <ProgressBar value={p.progress * 100} tone={progressTone(p, now)} />
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
          {/* The tiles count active projects, so they rest while archived ones show. */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {tiles.map(([key, label, icon, tone]) => (
              <FilterTile key={key} label={label} icon={icon} tone={tone} count={stats.counts[key]} pressed={filter === key && !showArchived} disabled={showArchived} onClick={() => setParam('show', filter === key ? null : key)} />
            ))}
          </div>

          <FilterBar shown={rows.length} total={total} noun={showArchived ? ['archived project', 'archived projects'] : ['project', 'projects']} active={active} onClear={clear}>
            <SearchBox label="Search projects" placeholder="Search names, keys and clients…" value={params.get('q') ?? ''} onChange={(q) => setParam('q', q)} className="col-span-2 sm:min-w-56 sm:flex-1" />
            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => setParam('archived', showArchived ? null : '1')}
              className={clsx('justify-self-start rounded-full border px-3 py-1.5 text-sm', showArchived ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-secondary hover:bg-surface-muted')}
            >
              Show archived
            </button>
          </FilterBar>

          {showArchived && archived.isError ? (
            <QueryError what="Archived projects" onRetry={() => void archived.refetch()} />
          ) : showArchived && archived.isPending ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            words ? (
              <EmptyState onClear={clear}>No projects match “{params.get('q')?.trim()}”.</EmptyState>
            ) : filter && !showArchived ? (
              <EmptyState onClear={clear}>No projects match this filter.</EmptyState>
            ) : (
              <EmptyState>{showArchived ? 'No archived projects.' : 'No projects yet.'}</EmptyState>
            )
          ) : (
            <>
              <div className="max-sm:hidden">
                <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} onRowClick={open} sort={sort} onSort={(next) => setParams((prev) => { const out = new URLSearchParams(prev); for (const [k, v] of Object.entries(sortParams(next))) { if (v) out.set(k, v); else out.delete(k) } return out })} storageKey="spark-flow.table.projects" label="Projects" />
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
