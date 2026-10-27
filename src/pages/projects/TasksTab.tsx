import clsx from 'clsx'
import { Columns3, List } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useSetBoard } from '@/api/projects'
import { useArchivedTasks, useSprints, useTickets, useUpdateTask } from '@/api/tickets'
import type { BoardColumn, Phase, ProjectSummary, TaskView, TicketPatch, User } from '@/api/types'
import { selectClass } from '@/components/ui/Field'
import { QueryError } from '@/components/ui/QueryError'
import { columnTaskCount } from '@/lib/boardColumns'
import { useUiStore, type ProjectView } from '@/lib/uiStore'
import { usePermission } from '@/lib/usePermission'
import { BacklogSkeleton, ProjectBacklog } from '@/pages/projects/ProjectBacklog'
import { BoardSkeleton, ProjectBoard } from '@/pages/projects/ProjectBoard'
import { byOrder } from './phases'
import { filterTasks, staleArchivedParam, validSprint, viewOf } from './taskFilters'

const views = [
  ['board', 'Board', Columns3],
  ['list', 'List', List],
] as const


/** Board | List, the raised pill on a muted track. Each is its own address; the filters stay. */
function ViewSwitch({ view }: { view: ProjectView }) {
  const [params] = useSearchParams()
  const searchFor = (value: ProjectView) => {
    const next = new URLSearchParams(params)
    next.set('view', value)
    return `?${next}`
  }
  return (
    <nav className="inline-flex rounded-lg bg-surface-muted p-0.5 ring-1 ring-line" aria-label="View">
      {views.map(([value, label, Icon]) => (
        <Link
          key={value}
          to={{ search: searchFor(value) }}
          aria-current={view === value ? 'page' : undefined}
          className={clsx('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium', view === value ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:text-fg')}
        >
          <Icon className="size-4" />
          <span className="max-sm:sr-only">{label}</span>
        </Link>
      ))}
    </nav>
  )
}

/** The Tasks tab: Board | List, phase chips and (agile) a sprint select. Every choice lives in the URL. */
export function TasksTab({ project, people, phases }: { project: ProjectSummary; people: User[]; phases: Phase[] }) {
  const [params, setParams] = useSearchParams()
  const lastView = useUiStore((state) => state.lastProjectView[project.key])
  const setProjectView = useUiStore((state) => state.setProjectView)
  const asked = params.get('view')
  const view: ProjectView = viewOf(asked, lastView)
  const agile = project.methodology === 'agile'
  const tickets = useTickets(project.id)
  const sprints = useSprints(agile ? project.id : undefined)
  // The address wins; without phase or sprint in it, the tab reopens on the last ones picked here.
  const lastFilters = useUiStore((state) => state.lastFilters[project.key])
  const setProjectFilters = useUiStore((state) => state.setProjectFilters)
  const filtersInUrl = params.has('phase') || params.has('sprint')
  const askedPhase = filtersInUrl ? params.get('phase') : (lastFilters?.phase ?? null)
  const askedSprint = filtersInUrl ? params.get('sprint') : (lastFilters?.sprint ?? null)
  const phase = phases.some((p) => p.id === askedPhase) ? askedPhase : null
  const sprint = agile ? validSprint(askedSprint, sprints.data ?? []) : null
  useEffect(() => {
    if (filtersInUrl) setProjectFilters(project.key, { phase: params.get('phase') ?? undefined, sprint: params.get('sprint') ?? undefined })
  }, [filtersInUrl, params, project.key, setProjectFilters])

  // Remember the view shown so the tab reopens it.
  useEffect(() => setProjectView(project.key, view), [view, project.key, setProjectView])

  // A phase or sprint pick (or clearing it) is remembered for this project, so the tab reopens on it.
  const setFilter = (key: 'phase' | 'sprint', value: string | null) => {
    setParam(key, value)
    setProjectFilters(project.key, { phase: phase ?? undefined, sprint: sprint ?? undefined, [key]: value ?? undefined })
  }
  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const check = usePermission()
  const update = useUpdateTask()
  const canMove = (t: TaskView) => check('task.updateOwnStatus', { project, taskAssigneeId: t.assigneeId })
  const move = (t: TaskView, patch: TicketPatch) => update.mutateAsync({ key: t.key, patch })
  const setBoard = useSetBoard()
  // Column names and order are the project manager's (and Admins').
  const onBoard = check('phase.manage', { project }) ? (columns: BoardColumn[]) => setBoard.mutateAsync({ id: project.id, columns }) : undefined

  const shown = filterTasks(tickets.data ?? [], { phase, sprint })
  // The list can also show the archived tasks, below the others, kept in ?archived=1.
  // Showing archived tasks only makes sense while there are some (the toggle goes when the last one is restored).
  const showArchivedAsked = view === 'list' && params.get('archived') === '1'
  const archivedQuery = useArchivedTasks(project.id, true)
  const archivedAll = archivedQuery.data ?? []
  const staleArchived = staleArchivedParam(params.get('archived') === '1', archivedQuery.data?.length)
  // Only the flag matters here: setParam is a new function each render.
  useEffect(() => {
    if (staleArchived) setParam('archived', null)
  }, [staleArchived])
  const archived = filterTasks(archivedAll, { phase, sprint })
  const showArchived = showArchivedAsked && archived.length > 0
  let body
  if (tickets.isError) body = <QueryError what="Tasks" onRetry={() => void tickets.refetch()} />
  else if (tickets.isPending) body = view === 'board' ? <BoardSkeleton /> : <BacklogSkeleton />
  else if (view === 'board') body = (
      <ProjectBoard tickets={shown} allTickets={tickets.data ?? []} users={people} canMove={canMove} onMove={move} error={update.error ? update.error.message : null} board={project.board} onBoard={onBoard} projectId={project.id} countOf={(id) => columnTaskCount(tickets.data ?? [], archivedAll, id)} />
    )
  else body = <ProjectBacklog tasks={shown} phases={phases} users={people} board={project.board} />

  const chip = (active: boolean) =>
    clsx('shrink-0 rounded-full border px-3 py-1.5 text-sm', active ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-secondary hover:bg-surface-muted')

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {phases.length > 0 && (
          <div className="-mx-4 flex w-[calc(100%+2rem)] min-w-0 gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:flex-1 sm:px-0" role="group" aria-label="Phase">
            <button type="button" aria-pressed={!phase} onClick={() => setFilter('phase', null)} className={chip(!phase)}>
              All phases
            </button>
            {byOrder(phases).map((p) => (
              <button key={p.id} type="button" aria-pressed={phase === p.id} onClick={() => setFilter('phase', phase === p.id ? null : p.id)} className={chip(phase === p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="ms-auto flex items-center gap-2">
          {agile && (
            <select className={clsx(selectClass, 'w-44')} aria-label="Sprint" value={sprint ?? ''} onChange={(e) => setFilter('sprint', e.target.value || null)}>
              <option value="">All sprints</option>
              {(sprints.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {view === 'list' && archived.length > 0 && (
            <button type="button" aria-pressed={showArchived} onClick={() => setParam('archived', showArchived ? null : '1')} className={chip(showArchived)}>
              Show archived ({archived.length})
            </button>
          )}
          <ViewSwitch view={view} />
        </div>
      </div>
      {body}
      {showArchived && archived.length > 0 && (
        <section aria-label="Archived tasks" className="mt-6 opacity-75">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">Archived</h2>
          <ProjectBacklog tasks={archived} phases={phases} users={people} board={project.board} />
        </section>
      )}
    </>
  )
}
