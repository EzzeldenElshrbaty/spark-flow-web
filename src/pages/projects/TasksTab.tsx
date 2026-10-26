import clsx from 'clsx'
import { Columns3, List } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useSprints, useTickets } from '@/api/tickets'
import type { Phase, ProjectSummary, User } from '@/api/types'
import { selectClass } from '@/components/ui/Field'
import { QueryError } from '@/components/ui/QueryError'
import { useUiStore, type ProjectView } from '@/lib/uiStore'
import { BacklogSkeleton, ProjectBacklog } from '@/pages/projects/ProjectBacklog'
import { BoardSkeleton, ProjectBoard } from '@/pages/projects/ProjectBoard'
import { byOrder } from './phases'
import { filterTasks } from './taskFilters'

const views = [
  ['board', 'Board', Columns3],
  ['list', 'List', List],
] as const

const isView = (value: string | null): value is ProjectView => value === 'board' || value === 'list'

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
  const view: ProjectView = isView(asked) ? asked : (lastView ?? 'board')
  const agile = project.methodology === 'agile'
  const tickets = useTickets(project.id)
  const sprints = useSprints(agile ? project.id : undefined)
  const phase = phases.some((p) => p.id === params.get('phase')) ? params.get('phase') : null
  const sprint = agile ? params.get('sprint') : null

  // Remember the view shown so the tab reopens it.
  useEffect(() => setProjectView(project.key, view), [view, project.key, setProjectView])

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

  const shown = filterTasks(tickets.data ?? [], { phase, sprint })
  let body
  if (tickets.isError) body = <QueryError what="Tasks" onRetry={() => void tickets.refetch()} />
  else if (tickets.isPending) body = view === 'board' ? <BoardSkeleton /> : <BacklogSkeleton />
  else if (view === 'board') body = <ProjectBoard tickets={shown} users={people} />
  else body = <ProjectBacklog tasks={shown} phases={phases} users={people} />

  const chip = (active: boolean) =>
    clsx('shrink-0 rounded-full border px-3 py-1.5 text-sm', active ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-secondary hover:bg-surface-muted')

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {phases.length > 0 && (
          <div className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Phase">
            <button type="button" aria-pressed={!phase} onClick={() => setParam('phase', null)} className={chip(!phase)}>
              All phases
            </button>
            {byOrder(phases).map((p) => (
              <button key={p.id} type="button" aria-pressed={phase === p.id} onClick={() => setParam('phase', phase === p.id ? null : p.id)} className={chip(phase === p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="ms-auto flex items-center gap-2">
          {agile && (
            <select className={clsx(selectClass, 'w-44')} aria-label="Sprint" value={sprint ?? ''} onChange={(e) => setParam('sprint', e.target.value || null)}>
              <option value="">All sprints</option>
              {(sprints.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <ViewSwitch view={view} />
        </div>
      </div>
      {body}
    </>
  )
}
