import clsx from 'clsx'
import { Columns3, List } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useSprints, useTickets } from '@/api/tickets'
import type { ProjectSummary, User } from '@/api/types'
import { QueryError } from '@/components/ui/QueryError'
import { paths } from '@/lib/paths'
import { useUiStore, type ProjectView } from '@/lib/uiStore'
import { BacklogSkeleton, ProjectBacklog } from '@/pages/projects/ProjectBacklog'
import { BoardSkeleton, ProjectBoard } from '@/pages/projects/ProjectBoard'

const views = [
  ['board', 'Board', Columns3],
  ['list', 'List', List],
] as const

const isView = (value: string | null): value is ProjectView => value === 'board' || value === 'list'

/** Board | List, the raised pill on a muted track. Each is its own address. */
function ViewSwitch({ ws, projectKey, view }: { ws: string; projectKey: string; view: ProjectView }) {
  return (
    <nav className="inline-flex rounded-lg bg-surface-muted p-0.5 ring-1 ring-line" aria-label="View">
      {views.map(([value, label, Icon]) => (
        <Link
          key={value}
          to={paths.project(ws, projectKey, 'tasks', { view: value })}
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

/** The Tasks tab: the board or the list. */
export function TasksTab({ ws, project, people }: { ws: string; project: ProjectSummary; people: User[] }) {
  const [params] = useSearchParams()
  const lastView = useUiStore((state) => state.lastProjectView[project.key])
  const setProjectView = useUiStore((state) => state.setProjectView)
  const asked = params.get('view')
  const view: ProjectView = isView(asked) ? asked : (lastView ?? 'board')
  const tickets = useTickets(project.id)
  const sprints = useSprints(view === 'list' ? project.id : undefined)

  // Remember the view shown so the tab reopens it.
  useEffect(() => setProjectView(project.key, view), [view, project.key, setProjectView])

  let body
  if (tickets.isError) body = <QueryError what="Tasks" onRetry={() => void tickets.refetch()} />
  else if (view === 'list' && sprints.isError) body = <QueryError what="Sprints" onRetry={() => void sprints.refetch()} />
  else if (view === 'board') body = tickets.isPending ? <BoardSkeleton /> : <ProjectBoard tickets={tickets.data} users={people} />
  else body = tickets.isPending || sprints.isPending ? <BacklogSkeleton /> : <ProjectBacklog tickets={tickets.data} sprints={sprints.data ?? []} users={people} />

  return (
    <>
      <div className="mb-3 flex justify-end">
        <ViewSwitch ws={ws} projectKey={project.key} view={view} />
      </div>
      {body}
    </>
  )
}
