import { Play } from 'lucide-react'
import { Link } from 'react-router'
import type { MyTimer, ProjectSummary, TaskView } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { columnLabel } from '@/lib/boardColumns'
import { timerForTask } from '@/lib/hours'
import { paths } from '@/lib/paths'
import { TicketRow } from '@/pages/projects/TicketRow'

/**
 * My work's list of my open tasks (UX Phase 2, 2.1: what My tasks was): overdue first, then over estimate, then by
 * due date, as `myOpenTasks` sorts them. Each row opens the task; Start starts my timer on a task I may log on.
 */
export function MyTasksCard({
  ws,
  tasks,
  loggable,
  timer,
  projects,
  assigneeName,
  onStart,
  starting,
}: {
  ws: string
  tasks: TaskView[]
  /** The tasks I may log time on (assigned isn't enough once I'm off the project). */
  loggable: TaskView[]
  timer: MyTimer | null | undefined
  projects: ProjectSummary[]
  assigneeName: string | null
  onStart: (taskId: string) => void
  starting: boolean
}) {
  const project = (id: string) => projects.find((p) => p.id === id)
  return (
    <section aria-label="My tasks">
      <Card className="overflow-hidden">
        <CardHeader title="My tasks" />
        {tasks.length === 0 ? (
          <p className="p-5 text-sm text-fg-muted">
            Nothing assigned to you. Tasks assigned to you show here.{' '}
            <Link to={paths.projects(ws)} className="font-medium text-accent hover:text-accent-strong">
              Browse projects
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {tasks.map((task) => {
              const p = project(task.projectId)
              return (
                <li key={task.id} className="flex items-center">
                  <div className="min-w-0 flex-1">
                    <TicketRow ticket={task} assignee={assigneeName} variant="row" project={p?.name} statusName={p ? columnLabel(p, task.status) : undefined} />
                  </div>
                  {!timerForTask(timer, task.id) && loggable.includes(task) && (
                    <Button variant="ghost" className="me-2 shrink-0" onClick={() => onStart(task.id)} disabled={starting} aria-label={`Start timer on ${task.key}`}>
                      <Play className="size-4" /> <span className="max-sm:sr-only">Start</span>
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </section>
  )
}
