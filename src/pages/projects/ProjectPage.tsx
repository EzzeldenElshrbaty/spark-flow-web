import clsx from 'clsx'
import { Columns3, List } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useProject, useSprints, useTickets } from '@/api/tickets'
import { useUsers } from '@/api/users'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { paths } from '@/lib/paths'
import { useUiStore, type ProjectView } from '@/lib/uiStore'
import { NotFound } from '@/pages/NotFound'
import { BacklogSkeleton, ProjectBacklog } from '@/pages/projects/ProjectBacklog'
import { BoardSkeleton, ProjectBoard } from '@/pages/projects/ProjectBoard'

const views = [
  ['board', 'Board', Columns3],
  ['backlog', 'Backlog', List],
] as const

const isView = (value: string): value is ProjectView => value === 'board' || value === 'backlog'

/** Board | Backlog, the raised pill on a muted track (as on Spark CRM's Opportunities). Each is its own address. */
function ViewSwitch({ ws, projectKey, view }: { ws: string; projectKey: string; view: ProjectView }) {
  return (
    <nav className="inline-flex rounded-lg bg-surface-muted p-0.5 ring-1 ring-line" aria-label="View">
      {views.map(([value, label, Icon]) => (
        <Link
          key={value}
          to={paths.project(ws, projectKey, value)}
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

/** A project: its name and description, then the board or the backlog. Read-only in Phase 1. */
export function ProjectPage() {
  const { ws = '', projectKey = '', view = '' } = useParams()
  const { workspace } = useCurrentWorkspace()
  const project = useProject(workspace?.id, projectKey)
  const projectId = project.data?.id
  const tickets = useTickets(projectId)
  const sprints = useSprints(view === 'backlog' ? projectId : undefined)
  const users = useUsers(workspace?.id)
  const setProjectView = useUiStore((state) => state.setProjectView)

  // Remember the view shown (from the switch, the back button or a typed address) so the sidebar link reopens it.
  const shown = isView(view) && Boolean(projectId) ? view : null
  useEffect(() => {
    if (shown) setProjectView(projectKey, shown)
  }, [shown, projectKey, setProjectView])

  if (!isView(view)) return <Navigate to={paths.project(ws, projectKey)} replace />

  if (project.isError) {
    return (
      <>
        <PageHeader title="Project" />
        <QueryError what="Project" onRetry={() => void project.refetch()} />
      </>
    )
  }
  if (project.isPending) {
    return (
      <>
        <div className="mb-6 space-y-2" aria-hidden>
          <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-muted" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-surface-muted" />
        </div>
        {view === 'board' ? <BoardSkeleton /> : <BacklogSkeleton />}
      </>
    )
  }
  if (!project.data) {
    return <NotFound what="project" backTo={paths.workspace(ws)} backLabel={`Back to ${workspace?.name ?? 'the workspace'}`} />
  }

  const people = users.data ?? []
  let body
  if (tickets.isError) body = <QueryError what="Tickets" onRetry={() => void tickets.refetch()} />
  else if (view === 'backlog' && sprints.isError) body = <QueryError what="Sprints" onRetry={() => void sprints.refetch()} />
  else if (view === 'board') body = tickets.isPending || users.isLoading ? <BoardSkeleton /> : <ProjectBoard tickets={tickets.data} users={people} />
  else body = tickets.isPending || sprints.isPending || users.isLoading ? <BacklogSkeleton /> : <ProjectBacklog tickets={tickets.data} sprints={sprints.data ?? []} users={people} />

  return (
    <>
      <PageHeader title={project.data.name} subtitle={project.data.description.trim() || '—'} actions={<ViewSwitch ws={ws} projectKey={projectKey} view={view} />} />
      {body}
    </>
  )
}
