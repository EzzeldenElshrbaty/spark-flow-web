import type { Sprint, Ticket, User } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { formatDate } from '@/lib/format'
import { TicketRow } from '@/pages/projects/TicketRow'
import { statuses } from '@/pages/projects/ticketPills'

type Group = { id: string; sprint: Sprint | null; tickets: Ticket[] }

const stateOrder: Record<Sprint['state'], number> = { active: 0, planned: 1, closed: 2 }
const statusOrder = (ticket: Ticket) => statuses.findIndex((s) => s.status === ticket.status)

/**
 * Sprints in the order work happens (active, then planned), then the tickets without a sprint. A closed sprint is
 * only listed while it still holds tickets, so none of them go missing.
 */
function groupBySprint(tickets: Ticket[], sprints: Sprint[]): Group[] {
  const sorted = [...tickets].sort((a, b) => statusOrder(a) - statusOrder(b) || a.rank - b.rank)
  const known = new Set(sprints.map((s) => s.id))
  const groups = [...sprints]
    .sort((a, b) => stateOrder[a.state] - stateOrder[b.state] || a.startDate.localeCompare(b.startDate))
    .map((sprint) => ({ id: sprint.id, sprint, tickets: sorted.filter((t) => t.sprintId === sprint.id) }))
    .filter((group) => group.sprint.state !== 'closed' || group.tickets.length > 0)
  return [...groups, { id: 'none', sprint: null, tickets: sorted.filter((t) => !t.sprintId || !known.has(t.sprintId)) }]
}

const stateBadge = { active: { tone: 'success', label: 'Active' }, planned: { tone: 'info', label: 'Planned' }, closed: { tone: 'neutral', label: 'Closed' } } as const

/** Pulse rows while the backlog loads. */
export function BacklogSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} className="h-16 animate-pulse rounded-lg bg-surface-muted" />
      ))}
    </div>
  )
}

/** The backlog, read-only: tickets grouped by sprint, each row with key, title, status, priority, assignee and points. */
export function ProjectBacklog({ tickets, sprints, users }: { tickets: Ticket[]; sprints: Sprint[]; users: User[] }) {
  const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
  return (
    <div className="space-y-6">
      {groupBySprint(tickets, sprints).map(({ id, sprint, tickets: items }) => {
        const points = items.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0)
        return (
          <Card key={id} className="overflow-hidden">
            <div className="border-b border-line-subtle px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="text-sm font-semibold text-fg">{sprint?.name ?? 'No sprint'}</h2>
                {sprint && <Badge tone={stateBadge[sprint.state].tone}>{stateBadge[sprint.state].label}</Badge>}
                <span className="ms-auto text-xs tabular-nums text-fg-muted">
                  {items.length} {items.length === 1 ? 'ticket' : 'tickets'} · {points} {points === 1 ? 'point' : 'points'}
                </span>
              </div>
              {sprint && (
                <p className="mt-1 text-xs text-fg-muted">
                  <span className="tabular-nums">
                    {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}
                  </span>
                  {sprint.goal && ` · ${sprint.goal}`}
                </p>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-fg-muted sm:px-5">{sprint ? 'No tickets in this sprint yet.' : 'Every ticket is in a sprint.'}</p>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {items.map((ticket) => (
                  <li key={ticket.id}>
                    <TicketRow ticket={ticket} assignee={nameOf(ticket.assigneeId)} variant="row" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )
      })}
    </div>
  )
}
