import clsx from 'clsx'
import { Inbox } from 'lucide-react'
import type { Ticket, User } from '@/api/types'
import { TicketRow } from '@/pages/projects/TicketRow'
import { statuses, statusTint } from '@/pages/projects/ticketPills'

const nameOf = (users: User[], id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? 'Unknown person') : null)

/** Pulse columns while the tickets load. */
export function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-busy="true">
      {statuses.map(({ status }) => (
        <div key={status} className="h-96 w-[85%] shrink-0 animate-pulse rounded-xl bg-surface-muted md:w-[296px]" />
      ))}
    </div>
  )
}

/**
 * The board, read-only: a tinted column per status with its count and points. The columns scroll sideways inside
 * the board; on phones each column takes most of the width and snaps, with the next one peeking in.
 */
export function ProjectBoard({ tickets, users }: { tickets: Ticket[]; users: User[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] md:mx-0 md:snap-none md:px-0">
      {statuses.map(({ status, label }) => {
        const items = tickets.filter((t) => t.status === status).sort((a, b) => a.rank - b.rank)
        const points = items.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0)
        const tint = statusTint[status]
        return (
          <section
            key={status}
            aria-label={`${label}: ${items.length} tickets`}
            className={clsx('flex w-[85%] shrink-0 snap-start flex-col overflow-hidden rounded-xl border md:max-h-[calc(100dvh-14rem)] md:w-[296px]', tint.border, tint.body)}
          >
            <header className={clsx('border-b px-3.5 py-3', tint.head, tint.border)}>
              <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
                <span className={clsx('size-2 shrink-0 rounded-full', tint.dot)} aria-hidden />
                <span className="truncate">{label}</span>
                <span className="ms-auto rounded-full bg-surface/80 px-2 py-px text-xs font-medium tabular-nums text-fg-tertiary">{items.length}</span>
              </h2>
              <p className="mt-1 ps-4 text-xs tabular-nums text-fg-muted">
                <span className="font-medium text-fg-secondary">{points}</span> {points === 1 ? 'point' : 'points'}
              </p>
            </header>
            <ul className="min-h-0 flex-1 space-y-2 p-2 md:overflow-y-auto">
              {items.map((ticket) => (
                <li key={ticket.id} className="motion-safe:animate-fade-in">
                  <TicketRow ticket={ticket} assignee={nameOf(users, ticket.assigneeId)} variant="card" />
                </li>
              ))}
              {items.length === 0 && (
                <li className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-line-strong/70 px-3 py-8 text-center text-xs text-fg-subtle">
                  <Inbox className="size-5" />
                  No tickets here
                </li>
              )}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
