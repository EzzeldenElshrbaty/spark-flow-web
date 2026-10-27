import clsx from 'clsx'
import { Inbox } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import type { TaskView, TicketStatus, User } from '@/api/types'
import { TicketRow } from '@/pages/projects/TicketRow'
import { statuses, statusTint } from '@/pages/projects/ticketPills'

const nameOf = (users: User[], id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? 'Unknown person') : null)

/** Pulse columns while the tickets load. */
export function BoardSkeleton() {
  return (
    <div className="relative flex gap-3 overflow-hidden" aria-busy="true">
      {statuses.map(({ status }) => (
        <div key={status} className="h-96 w-[85%] shrink-0 animate-pulse rounded-xl bg-surface-muted md:w-[296px]" />
      ))}
    </div>
  )
}

const DRAG_TYPE = 'application/x-spark-task'

/**
 * The board: a tinted column per status with its count and hours logged. The columns scroll sideways inside
 * the board; on phones each column takes most of the width and snaps, with the next one peeking in.
 * A card the person may move drags to another column (mouse only; the task panel's Status select is the other way).
 */
export function ProjectBoard({
  tickets,
  users,
  canMove = () => false,
  onMove,
  error,
}: {
  tickets: TaskView[]
  users: User[]
  canMove?: (ticket: TaskView) => boolean
  onMove?: (ticket: TaskView, to: TicketStatus) => void
  error?: string | null
}) {
  const [over, setOver] = useState<TicketStatus | null>(null)
  const dragging = (e: DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE)
  return (
    <>
      <p id="board-hint" className="sr-only">
        Drag a card to another column, or change its status in the task panel.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div aria-describedby="board-hint" className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] md:mx-0 md:snap-none md:px-0">
        {statuses.map(({ status, label }) => {
          const items = tickets.filter((t) => t.status === status).sort((a, b) => a.rank - b.rank)
          const hours = Math.round(items.reduce((sum, t) => sum + t.loggedHours, 0) * 10) / 10
          const tint = statusTint[status]
          return (
            <section
              key={status}
              aria-label={`${label}: ${items.length} tasks`}
              className={clsx(
                'relative flex w-[85%] shrink-0 snap-start flex-col overflow-hidden rounded-xl border md:max-h-[calc(100dvh-14rem)] md:w-[296px]',
                tint.border,
                tint.body,
                over === status && 'ring-2 ring-accent/40',
              )}
              onDragOver={(e) => {
                if (!dragging(e)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setOver(status)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
              }}
              onDrop={(e) => {
                setOver(null)
                const key = e.dataTransfer.getData(DRAG_TYPE)
                const ticket = tickets.find((t) => t.key === key)
                if (!ticket || !dragging(e)) return
                e.preventDefault()
                onMove?.(ticket, status)
              }}
            >
              <header className={clsx('border-b px-3.5 py-3', tint.head, tint.border)}>
                <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
                  <span className={clsx('size-2 shrink-0 rounded-full', tint.dot)} aria-hidden />
                  <span className="truncate">{label}</span>
                  <span className="ms-auto rounded-full bg-surface/80 px-2 py-px text-xs font-medium tabular-nums text-fg-tertiary">{items.length}</span>
                </h2>
                <p className="mt-1 ps-4 text-xs tabular-nums text-fg-muted">
                  <span className="font-medium text-fg-secondary">{hours}h</span> logged
                </p>
              </header>
              <ul className="min-h-0 flex-1 space-y-2 p-2 md:overflow-y-auto">
                {items.map((ticket) => (
                  <li
                    key={ticket.id}
                    className={clsx('motion-safe:animate-fade-in', canMove(ticket) && 'cursor-grab active:cursor-grabbing')}
                    draggable={canMove(ticket)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, ticket.key)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                  >
                    <TicketRow ticket={ticket} assignee={nameOf(users, ticket.assigneeId)} variant="card" />
                  </li>
                ))}
                {items.length === 0 && (
                  <li className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-line-strong/70 px-3 py-8 text-center text-xs text-fg-subtle">
                    <Inbox className="size-5" />
                    No tasks here
                  </li>
                )}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}
