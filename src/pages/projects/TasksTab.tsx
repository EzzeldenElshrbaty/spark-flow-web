import clsx from 'clsx'
import { Columns3, IterationCw, List } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useSetBoard } from '@/api/projects'
import { useArchivedTasks, useSprints, useTickets, useUpdateTask, useMoveTask } from '@/api/tickets'
import type { BoardColumn, Phase, ProjectSummary, Sprint, TaskView, TicketPatch, User } from '@/api/types'
import { EmptyState } from '@/components/ui/EmptyState'
import { selectClass } from '@/components/ui/Field'
import { FilterBar } from '@/components/ui/FilterBar'
import { QueryError } from '@/components/ui/QueryError'
import { SearchBox } from '@/components/ui/SearchBox'
import { columnTaskCount } from '@/lib/boardColumns'
import { useUiStore, type ProjectView } from '@/lib/uiStore'
import { usePermission } from '@/lib/usePermission'
import { useRole } from '@/lib/useRole'
import { useParamState } from '@/lib/searchParams'
import { BacklogSkeleton, ProjectBacklog } from '@/pages/projects/ProjectBacklog'
import { BoardSkeleton, ProjectBoard } from '@/pages/projects/ProjectBoard'
import { CompleteSprintSheet } from '@/pages/projects/sprints/CompleteSprintSheet'
import { DeleteSprintSheet } from '@/pages/projects/sprints/DeleteSprintSheet'
import { SprintPlan, type SprintActions } from '@/pages/projects/sprints/SprintPlan'
import { SprintSheet } from '@/pages/projects/sprints/SprintSheet'
import { byOrder } from './phases'
import { activeFilters, filtersFrom, filterTasks, matchesQuery, PRIORITIES, sortOf, sortTasks, sprintPlanTasks, staleArchivedParam, TASK_SORTS, taskQueryFrom, validSprint, viewOf } from './taskFilters'
import { SegmentedControl } from '@/components/ui/SegmentedControl'

const views = [
  ['board', 'Board', Columns3],
  ['list', 'List', List],
  ['sprints', 'Sprints', IterationCw],
] as const

/**
 * Board | List (| Sprints on agile projects), the raised pill on a muted track (UX Phase 3: one segmented control). A
 * pick is a step Back undoes; the filters stay.
 */
function ViewSwitch({ view, agile }: { view: ProjectView; agile: boolean }) {
  const [, setParams] = useSearchParams()
  return (
    <SegmentedControl
      label="View"
      value={view}
      onChange={(next, how) =>
        setParams(
          (prev) => {
            const params = new URLSearchParams(prev)
            params.set('view', next)
            return params
          },
          { replace: Boolean(how?.keys) },
        )
      }
      options={views.filter(([value]) => agile || value !== 'sprints').map(([value, label, icon]) => ({ value, label, icon, iconOnlyOnPhone: true }))}
    />
  )
}

/** The sprint sheet that's open: Create sprint, or one of a sprint's own (its Edit, Start, Complete and Delete). */
type SprintSheetState = { kind: 'create' } | { kind: 'edit' | 'start' | 'complete' | 'remove'; sprint: Sprint }

/** The open sprint sheet. Complete and Delete count the project's tasks, whatever the filters. */
function SprintSheets({ state, project, sprints, tasks, onClose }: { state: SprintSheetState; project: ProjectSummary; sprints: Sprint[]; tasks: TaskView[]; onClose: () => void }) {
  switch (state.kind) {
    case 'create':
      return <SprintSheet mode="create" project={project} sprints={sprints} tasks={tasks} onClose={onClose} />
    case 'edit':
    case 'start':
      return <SprintSheet mode={state.kind} sprint={state.sprint} project={project} sprints={sprints} tasks={tasks} onClose={onClose} />
    case 'complete':
      return <CompleteSprintSheet sprint={state.sprint} sprints={sprints} tasks={tasks} onClose={onClose} />
    case 'remove':
      return <DeleteSprintSheet sprint={state.sprint} tasks={tasks} onClose={onClose} />
  }
}

/** The Tasks tab: Board | List (| Sprints), phase chips and (agile) a sprint select. Every choice lives in the URL. */
export function TasksTab({ project, people, phases }: { project: ProjectSummary; people: User[]; phases: Phase[] }) {
  const [params, setParams] = useSearchParams()
  const lastView = useUiStore((state) => state.lastProjectView[project.key])
  const setProjectView = useUiStore((state) => state.setProjectView)
  const asked = params.get('view')
  const agile = project.methodology === 'agile'
  const view: ProjectView = viewOf(asked, lastView, agile)
  const tickets = useTickets(project.id)
  const sprints = useSprints(agile ? project.id : undefined)
  // The address wins; without phase or sprint in it, the tab reopens on the last ones picked here.
  const lastFilters = useUiStore((state) => state.lastFilters[project.key])
  const setProjectFilters = useUiStore((state) => state.setProjectFilters)
  const picked = filtersFrom(params, lastFilters)
  const phase = phases.some((p) => p.id === picked.phase) ? picked.phase : null
  const sprint = agile ? validSprint(picked.sprint, sprints.data ?? []) : null
  // The Sprints view shows every open sprint: the address's sprint stays there for Board and List, but filters nothing.
  const sprintFilter = view === 'sprints' ? null : sprint

  // A remembered phase or sprint is written into the address as the tab opens (replacing the entry), so Back after
  // another pick returns to it (UX Phase 6).
  useEffect(() => {
    if ((params.has('phase') || !phase) && (params.has('sprint') || !sprint)) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (phase && !next.has('phase')) next.set('phase', phase)
        if (sprint && !next.has('sprint')) next.set('sprint', sprint)
        return next
      },
      { replace: true },
    )
  }, [params, phase, sprint, setParams])

  // Remember the view shown so the tab reopens it.
  useEffect(() => setProjectView(project.key, view), [view, project.key, setProjectView])

  // A phase or sprint pick (or clearing it) is remembered for this project, so the tab reopens on it.
  const setFilter = (key: 'phase' | 'sprint', value: string | null) => {
    setParam(key, value)
    setProjectFilters(project.key, { phase: phase ?? undefined, sprint: sprint ?? undefined, [key]: value ?? undefined })
  }
  // A choice is a step Back undoes (UX Phase 2, 2.7); a correction the page makes itself replaces the entry.
  const setParam = (key: string, value: string | null, replace = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace },
    )

  const check = usePermission()
  const update = useUpdateTask()
  const moveTask = useMoveTask()
  // Whoever may manage the project's tasks (an Admin or its manager) plans its sprints; for everyone else the view has
  // no sprint buttons.
  const [sprintSheet, setSprintSheet] = useState<SprintSheetState | null>(null)
  const sprintActions: SprintActions = check('task.manage', { project })
    ? {
        create: () => setSprintSheet({ kind: 'create' }),
        edit: (sprint) => setSprintSheet({ kind: 'edit', sprint }),
        start: (sprint) => setSprintSheet({ kind: 'start', sprint }),
        complete: (sprint) => setSprintSheet({ kind: 'complete', sprint }),
        remove: (sprint) => setSprintSheet({ kind: 'remove', sprint }),
      }
    : null
  const canMove = (t: TaskView) => check('task.updateOwnStatus', { project, taskAssigneeId: t.assigneeId })
  const move = (t: TaskView, patch: TicketPatch) => update.mutateAsync({ key: t.key, patch })
  const setBoard = useSetBoard()
  // Column names and order are the project manager's (and Admins').
  const onBoard = check('phase.manage', { project }) ? (columns: BoardColumn[]) => setBoard.mutateAsync({ id: project.id, columns }) : undefined

  // Search, assignee, priority, type and (List) sort, each in the address (UX Phase 4, 4.2): typing replaces the
  // entry, a choice is a step Back undoes, Clear filters takes them all off at once (phase and sprint too).
  const { persona } = useRole()
  const [, setFilters] = useParamState({ typed: ['q'] })
  const query = taskQueryFrom(params)
  const sort = sortOf(params.get('sort'))
  const active = activeFilters(query, { phase, sprint: sprintFilter })
  const clear = () => {
    setFilters({ q: null, assignee: null, priority: null, type: null, phase: null, sprint: null })
    setProjectFilters(project.key, {})
  }
  const all = tickets.data ?? []
  const shown = filterTasks(all, { phase, sprint: sprintFilter }).filter((t) => matchesQuery(t, query, persona.id))
  // The Sprints view counts what it lists (no closed sprints, no finished tasks outside a sprint).
  const counted = view === 'sprints' ? { shown: sprintPlanTasks(shown, sprints.data ?? []).length, total: sprintPlanTasks(all, sprints.data ?? []).length } : { shown: shown.length, total: all.length }
  // The list can also show the archived tasks, below the others, kept in ?archived=1.
  // Showing archived tasks only makes sense while there are some (the toggle goes when the last one is restored).
  const showArchivedAsked = view === 'list' && params.get('archived') === '1'
  const archivedQuery = useArchivedTasks(project.id, true)
  const archivedAll = archivedQuery.data ?? []
  const staleArchived = staleArchivedParam(params.get('archived') === '1', archivedQuery.data?.length)
  // Only the flag matters here: setParam is a new function each render.
  useEffect(() => {
    if (staleArchived) setParam('archived', null, true)
  }, [staleArchived])
  // Someone the address names who isn't among the people (an old link) leaves it, and the filter reads Anyone (UX Phase 6).
  const staleAssignee = Boolean(query.assignee) && people.length > 0 && query.assignee !== 'me' && query.assignee !== 'none' && !people.some((u) => u.id === query.assignee)
  useEffect(() => {
    if (staleAssignee) setParam('assignee', null, true)
  }, [staleAssignee])
  const archived = filterTasks(archivedAll, { phase, sprint })
  const showArchived = showArchivedAsked && archived.length > 0
  let body
  if (tickets.isError) body = <QueryError what="Tasks" onRetry={() => void tickets.refetch()} />
  else if (view === 'sprints' && sprints.isError) body = <QueryError what="Sprints" onRetry={() => void sprints.refetch()} />
  else if (tickets.isPending || (view === 'sprints' && sprints.isPending)) body = view === 'board' ? <BoardSkeleton /> : <BacklogSkeleton />
  else if (view === 'board') body = (
      <ProjectBoard tickets={shown} allTickets={tickets.data ?? []} users={people} canMove={canMove} onMove={move} onMoveTo={(t, status, index, visibleKeys) => moveTask.mutateAsync({ key: t.key, status, index, visibleKeys })} error={(update.error ?? moveTask.error)?.message ?? null} board={project.board} onBoard={onBoard} projectId={project.id} countOf={(id) => columnTaskCount(tickets.data ?? [], archivedAll, id)} />
    )
  else if (view === 'sprints') body = <SprintPlan project={project} tasks={shown} allTasks={all} sprints={sprints.data ?? []} users={people} actions={sprintActions} />
  else if (shown.length === 0 && active > 0)
    body = <EmptyState onClear={clear}>{query.q?.trim() ? `No tasks match “${query.q.trim()}”.` : 'No tasks match these filters.'}</EmptyState>
  else body = <ProjectBacklog tasks={sortTasks(shown, sort)} order={sort === 'board' ? 'board' : 'given'} phases={phases} users={people} board={project.board} />
  const select = (label: string, key: string, value: string | undefined, options: [string, string][]) => (
    <select className={clsx(selectClass, 'sm:w-40')} aria-label={label} value={value ?? ''} onChange={(e) => setFilters({ [key]: e.target.value })}>
      {options.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  )

  const chip = (active: boolean) =>
    clsx('shrink-0 rounded-full border px-3 py-1.5 text-sm', active ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-secondary hover:bg-surface-muted')

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
          {agile && view !== 'sprints' && (
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
          <ViewSwitch view={view} agile={agile} />
        </div>
      </div>
      <FilterBar sticky={false} shown={counted.shown} total={tickets.data ? counted.total : undefined} noun={['task', 'tasks']} active={active} onClear={clear}>
        <SearchBox label="Search tasks" placeholder="Search keys and titles…" value={query.q ?? ''} onChange={(q) => setFilters({ q })} className="col-span-2 sm:min-w-48 sm:flex-1" />
        {select('Assignee', 'assignee', query.assignee, [
          ['', 'Anyone'],
          ['me', 'Me'],
          ['none', 'Unassigned'],
          ...[...people].sort((a, b) => a.name.localeCompare(b.name)).map((u): [string, string] => [u.id, u.name]),
        ])}
        {select('Priority', 'priority', query.priority, [['', 'Any priority'], ...PRIORITIES])}
        {select('Type', 'type', query.type, [
          ['', 'Any type'],
          ['task', 'Tasks'],
          ['bug', 'Bugs'],
        ])}
        {view === 'list' && select('Sort', 'sort', sort === 'attention' ? '' : sort, TASK_SORTS.map(({ value, label }) => [value === 'attention' ? '' : value, label]))}
      </FilterBar>
      {body}
      {sprintSheet && <SprintSheets state={sprintSheet} project={project} sprints={sprints.data ?? []} tasks={all} onClose={() => setSprintSheet(null)} />}
      {showArchived && archived.length > 0 && (
        <section aria-label="Archived tasks" className="mt-6 opacity-75">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">Archived</h2>
          <ProjectBacklog tasks={archived} phases={phases} users={people} board={project.board} />
        </section>
      )}
    </>
  )
}
