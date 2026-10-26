import clsx from 'clsx'
import { Link, useSearchParams } from 'react-router'
import type { Ticket } from '@/api/types'
import { Avatar } from '@/components/ui/Avatar'
import { parseInspector, withInspector } from '@/lib/inspector'
import { PriorityPill, StatusPill, TicketKey, pointsLabel } from '@/pages/projects/ticketPills'

function Assignee({ name }: { name: string | null }) {
  if (!name) return <span className="size-6 shrink-0 rounded-full border border-dashed border-line-strong" title="Unassigned" aria-label="Unassigned" role="img" />
  return (
    <span title={name} className="inline-flex">
      <Avatar name={name} size="sm" />
      <span className="sr-only">{name}</span>
    </span>
  )
}

/**
 * A ticket as a board card or a backlog row. Either opens the ticket inspector (`?ticket=KEY`) and keeps the rest of
 * the URL; the open ticket stays outlined.
 */
export function TicketRow({ ticket, assignee, variant }: { ticket: Ticket; assignee: string | null; variant: 'card' | 'row' }) {
  const [params] = useSearchParams()
  const open = parseInspector(params)
  const selected = open?.kind === 'ticket' && open.key === ticket.key
  const to = { search: withInspector(params, { kind: 'ticket', key: ticket.key }).toString() }

  if (variant === 'card') {
    return (
      <Link
        to={to}
        aria-current={selected || undefined}
        className={clsx(
          'block rounded-xl border bg-surface p-3.5 shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/40 active:bg-surface-sunken',
          selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-line',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <TicketKey value={ticket.key} className="text-fg-muted" />
          <PriorityPill priority={ticket.priority} />
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm font-medium text-fg">{ticket.title}</p>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <Assignee name={assignee} />
          <span className="text-xs tabular-nums text-fg-muted">{pointsLabel(ticket.storyPoints)}</span>
        </div>
      </Link>
    )
  }

  return (
    <Link
      to={to}
      aria-current={selected || undefined}
      className={clsx('flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken active:bg-surface-sunken sm:items-center', selected && 'bg-accent-soft hover:bg-accent-soft')}
    >
      <TicketKey value={ticket.key} className="mt-0.5 w-16 shrink-0 text-fg-muted sm:mt-0" />
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
        <p className="truncate text-sm text-fg sm:min-w-0 sm:flex-1">{ticket.title}</p>
        <div className="mt-1.5 flex items-center gap-2 sm:mt-0 sm:shrink-0">
          <StatusPill status={ticket.status} />
          <PriorityPill priority={ticket.priority} />
          <span className="ms-auto flex items-center gap-2 sm:ms-0">
            <Assignee name={assignee} />
            <span className="w-12 text-end text-xs tabular-nums text-fg-muted">{pointsLabel(ticket.storyPoints)}</span>
          </span>
        </div>
      </div>
    </Link>
  )
}
