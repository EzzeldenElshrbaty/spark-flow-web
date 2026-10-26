import clsx from 'clsx'
import { AlarmClock, CalendarClock, CircleDashed, ClipboardList, Pause, Trophy, UserPlus, XCircle, type LucideIcon } from 'lucide-react'
import { createElement, type ReactNode } from 'react'
import { Link } from 'react-router'
import { iconForType } from '../../lib/activityIcons'
import { daysSince, formatDate, formatDue, isPast, isToday } from '../../lib/format'
import type { OpportunityRow } from '../../api/opportunities'
import { Avatar } from '../leads/shared'
import { useActivityTypes } from '../leads/useActivityTypes'
import { Money } from './shared'

/**
 * A deal on the board (and the phone list): company and value, contact, then one quiet line for what's
 * next. Color only where it means something: an overdue date in red, on hold in amber.
 */
export function DealCard({ row, showRep, stageLabel }: { row: OpportunityRow; showRep: boolean; stageLabel?: ReactNode }) {
  const active = row.status === 'Open' || row.status === 'On hold'
  const needsOwner = active && !row.repId
  const extras = stageLabel || needsOwner || (showRep && row.repName) || (row.scopingStatus && row.scopingStatus !== 'Done') || (row.wonRequested && row.status === 'Open')
  return (
    <Link
      to={`/opportunities/${row.id}`}
      draggable={false}
      className="block rounded-xl border border-line bg-surface p-3.5 shadow-sm outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500/40 active:bg-surface-sunken"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-fg">{row.company}</p>
        <Money value={row.value} currency={row.currency} className="shrink-0 text-sm font-medium text-fg-secondary" />
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-fg-muted">
        <span className="min-w-0 truncate">{row.contactName}</span>
        {active && (
          <span className="shrink-0 tabular-nums text-fg-subtle" title="Time in this stage">
            {daysSince(row.stageSince)} in stage
          </span>
        )}
      </div>

      <div className="mt-2.5">
        <StatusLine row={row} />
      </div>

      {extras && (
        <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-fg-muted">
          {stageLabel}
          {needsOwner && (
            <span className="inline-flex shrink-0 items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
              <UserPlus className="size-3.5" /> Needs owner
            </span>
          )}
          {showRep && row.repName && (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar name={row.repName} size="sm" />
              <span className="truncate">{row.repName}</span>
            </span>
          )}
          {row.scopingStatus && row.scopingStatus !== 'Done' && (
            <span className="inline-flex shrink-0 items-center gap-1" title={`Scoping: ${row.scopingStatus}`}>
              <ClipboardList className="size-3.5" /> {row.scopingStatus}
            </span>
          )}
          {row.wonRequested && row.status === 'Open' && (
            <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <Trophy className="size-3.5" /> Won requested
            </span>
          )}
        </div>
      )}
    </Link>
  )
}

/** The next step for open deals, or why it's on hold, won or lost. */
function StatusLine({ row }: { row: OpportunityRow }) {
  const types = useActivityTypes()
  if (row.status === 'On hold') {
    return (
      <Line icon={Pause} className="text-amber-700 dark:text-amber-400">
        On hold{row.holdUntil ? ` until ${formatDate(row.holdUntil)}` : ''}
        {row.holdReason && <span className="text-fg-muted"> · {row.holdReason}</span>}
      </Line>
    )
  }
  if (row.status === 'Won') {
    return <Line icon={Trophy} className="text-fg-muted">Signed{row.closedAt ? ` ${formatDate(row.closedAt)}` : ''}</Line>
  }
  if (row.status === 'Lost') {
    return <Line icon={XCircle} className="text-fg-muted">{row.lostReason ?? 'Lost'}</Line>
  }
  const step = row.nextAction
  if (!step) {
    return <Line icon={CircleDashed} className="text-amber-700 dark:text-amber-400">No next step</Line>
  }
  const overdue = isPast(step.due)
  const today = !overdue && isToday(step.due)
  const label = types.find((type) => type.id === step.type)?.label ?? 'Follow up'
  return (
    <div className="space-y-1">
      <Line icon={iconForType(step.type, types)} className="text-fg-secondary">
        {label}
        {step.note && <span className="text-fg-muted"> · {step.note}</span>}
      </Line>
      <Line icon={overdue ? AlarmClock : CalendarClock} className={overdue ? 'font-medium text-red-600 dark:text-red-400' : today ? 'font-medium text-sky-700 dark:text-sky-400' : 'text-fg-muted'}>
        {formatDue(step.due)}
      </Line>
    </div>
  )
}

function Line({ icon, className, children }: { icon: LucideIcon; className: string; children: ReactNode }) {
  return (
    <p className={clsx('flex min-w-0 items-center gap-1.5 text-xs', className)}>
      {createElement(icon, { className: 'size-3.5 shrink-0' })}
      <span className="min-w-0 truncate">{children}</span>
    </p>
  )
}
