import type { Phase, TaskView, User } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { formatDate } from '@/lib/format'
import { TicketRow } from '@/pages/projects/TicketRow'
import { statuses } from '@/pages/projects/ticketPills'
import { groupByPhase } from './taskFilters'

const statusOrder = (task: TaskView) => statuses.findIndex((s) => s.status === task.status)
const phaseBadge = { notStarted: { tone: 'neutral', label: 'Not started' }, inProgress: { tone: 'info', label: 'In progress' }, done: { tone: 'success', label: 'Done' } } as const

/** Pulse rows while the list loads. */
export function BacklogSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="h-16 animate-pulse rounded-lg bg-surface-muted" />
      ))}
    </div>
  )
}

/** The List view: tasks grouped by phase in phase order, then those without a phase. Empty phases are left out. */
export function ProjectBacklog({ tasks, phases, users }: { tasks: TaskView[]; phases: Phase[]; users: User[] }) {
  const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
  const sorted = [...tasks].sort((a, b) => statusOrder(a) - statusOrder(b) || a.rank - b.rank)
  const groups = groupByPhase(sorted, phases).filter((g) => g.tasks.length > 0)
  if (groups.length === 0) return <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-fg-secondary">No tasks here.</p>

  return (
    <div className="space-y-6">
      {groups.map(({ phase, tasks: items }) => {
        const hours = Math.round(items.reduce((sum, t) => sum + t.loggedHours, 0) * 10) / 10
        const overdue = items.filter((t) => t.overdue).length
        return (
          <Card key={phase?.id ?? 'none'} className="relative overflow-hidden">
            <div className="border-b border-line-subtle px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="text-sm font-semibold text-fg">{phase?.name ?? 'No phase'}</h2>
                {phase && <Badge tone={phaseBadge[phase.status].tone}>{phaseBadge[phase.status].label}</Badge>}
                <span className="ms-auto text-xs tabular-nums text-fg-muted">
                  {items.length} {items.length === 1 ? 'task' : 'tasks'} · {hours}h logged
                  {overdue > 0 && <span className="text-red-600 dark:text-red-400"> · {overdue} overdue</span>}
                </span>
              </div>
              {phase && (
                <p className="mt-1 text-xs tabular-nums text-fg-muted">
                  {formatDate(phase.startDate)} – {formatDate(phase.dueDate)}
                </p>
              )}
            </div>
            <ul className="divide-y divide-line-subtle">
              {items.map((task) => (
                <li key={task.id}>
                  <TicketRow ticket={task} assignee={nameOf(task.assigneeId)} variant="row" />
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}
