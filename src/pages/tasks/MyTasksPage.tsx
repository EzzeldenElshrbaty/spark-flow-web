import { useProjectSummaries } from '@/api/projects'
import { useTasksOf } from '@/api/tickets'
import { useUsers } from '@/api/users'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useRole } from '@/lib/useRole'
import { BacklogSkeleton } from '@/pages/projects/ProjectBacklog'
import { myOpenTasks } from '@/pages/projects/taskFilters'
import { TicketRow } from '@/pages/projects/TicketRow'
import { columnLabel } from '@/lib/boardColumns'

/** Your open tasks across every project of the workspace: overdue first, then over estimate, then by due date. */
export function MyTasksPage() {
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const projects = useProjectSummaries(workspace?.id)
  const tasks = useTasksOf((projects.data ?? []).map((p) => p.id))
  const people = useUsers(workspace?.id).data ?? []
  const mine = myOpenTasks(tasks.data, persona.id)
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name
  // Each task's column as its project names it (a custom column has no standard name).
  const statusNameOf = (projectId: string, status: string) => {
    const project = projects.data?.find((p) => p.id === projectId)
    return project ? columnLabel(project, status) : undefined
  }
  const overdue = mine.filter((t) => t.overdue).length
  const overEstimate = mine.filter((t) => t.overEstimate).length

  let body
  if (projects.isError || tasks.isError) body = <QueryError what="Tasks" onRetry={() => (projects.isError ? void projects.refetch() : tasks.refetch())} />
  else if (projects.isPending || tasks.isPending) body = <BacklogSkeleton />
  else if (mine.length === 0) body = <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-fg-secondary">Nothing assigned to you.</p>
  else
    body = (
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line-subtle">
          {mine.map((task) => (
            <li key={task.id}>
              <TicketRow ticket={task} assignee={people.find((u) => u.id === task.assigneeId)?.name ?? null} variant="row" project={projectName(task.projectId)} statusName={statusNameOf(task.projectId, task.status)} />
            </li>
          ))}
        </ul>
      </Card>
    )

  const subtitle = mine.length ? `${mine.length} open${overdue ? ` · ${overdue} overdue` : ''}${overEstimate ? ` · ${overEstimate} over estimate` : ''}` : 'Your open tasks across every project.'
  return (
    <>
      <PageHeader title="My tasks" subtitle={subtitle} />
      {body}
    </>
  )
}
