import clsx from 'clsx'
import { Link, useSearchParams } from 'react-router'
import type { StatusCategory, TaskView } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { formatDate } from '@/lib/format'
import { parseInspector, withInspector } from '@/lib/inspector'
import { BugPill, OverEstimatePill, OverduePill, PriorityPill, StatusPill, TicketKey, hoursLabel } from '@/pages/projects/ticketPills'
import { isPastDue } from '@/lib/dates'

function Assignee({ name }: { name: string | null }) {
  if (!name) return <span className="size-6 shrink-0 rounded-full border border-dashed border-line-strong" title="Unassigned" aria-label="Unassigned" role="img" />
  return (
    <span title={name} className="inline-flex">
      <Avatar name={name} size={24} decorative />
      <span className="sr-only">{name}</span>
    </span>
  )
}

/**
 * A task as a board card or a list row: Bug, Overdue and Over estimate chips, hours against the estimate (amber once
 * over it), and (rows) the due date.
 * Either opens the ticket inspector (`?ticket=KEY`) and keeps the rest of the URL; the open ticket stays outlined.
 */
/** `describedBy`: how to move a movable board card, read with its link (UX Phase 5A, 5.6). */
export function TicketRow({ ticket, assignee, variant, project, statusName, statusCategory, describedBy }: { ticket: TaskView; assignee: string | null; variant: 'card' | 'row'; project?: string; statusName?: string; statusCategory?: StatusCategory; describedBy?: string }) {
  const [params] = useSearchParams()
  const open = parseInspector(params)
  const selected = open?.kind === 'ticket' && open.key === ticket.key
  const to = { search: withInspector(params, { kind: 'ticket', key: ticket.key }).toString() }

  if (variant === 'card') {
    return (
      <Link
        to={to}
        aria-describedby={describedBy}
        aria-current={selected || undefined}
        className={clsx(
          'block rounded-xl border bg-surface p-3.5 shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/40 active:bg-surface-sunken',
          selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-line',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <TicketKey value={ticket.key} className="text-fg-muted" />
          <span className="flex items-center gap-1">
            {ticket.type === 'bug' && <BugPill />}
            {ticket.overdue && <OverduePill />}
            {ticket.overEstimate && <OverEstimatePill />}
            <PriorityPill priority={ticket.priority} />
          </span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm font-medium text-fg">{ticket.title}</p>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <Assignee name={assignee} />
          <span className={clsx('text-xs tabular-nums', ticket.overEstimate ? 'text-amber-700 dark:text-amber-300' : 'text-fg-muted')}>{hoursLabel(ticket.loggedHours, ticket.estimateHours)}</span>
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
        <p className="truncate text-sm text-fg sm:min-w-0 sm:flex-1">
          {ticket.title}
          {project && <span className="text-fg-muted"> · {project}</span>}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-0 sm:shrink-0 sm:flex-nowrap">
          {ticket.type === 'bug' && <BugPill />}
          {ticket.overdue && <OverduePill />}
          {ticket.overEstimate && <OverEstimatePill />}
          <StatusPill status={ticket.status} label={statusName} category={statusCategory ?? ticket.category} />
          <PriorityPill priority={ticket.priority} />
          <span className="ms-auto flex items-center gap-2 sm:ms-0">
            <span className={clsx('w-20 text-end text-xs tabular-nums', ticket.dueAt && ticket.category !== 'done' && isPastDue(ticket.dueAt, new Date()) ? 'text-red-600 dark:text-red-400' : 'text-fg-muted')}>
              {ticket.dueAt ? formatDate(ticket.dueAt) : '—'}
            </span>
            <span className={clsx('w-20 text-end text-xs tabular-nums', ticket.overEstimate ? 'text-amber-700 dark:text-amber-300' : 'text-fg-muted')}>{hoursLabel(ticket.loggedHours, ticket.estimateHours)}</span>
            <Assignee name={assignee} />
          </span>
        </div>
      </div>
    </Link>
  )
}
