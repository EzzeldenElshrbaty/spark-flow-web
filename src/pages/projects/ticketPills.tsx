import clsx from 'clsx'
import type { Priority, StatusCategory, TicketStatus } from '@/api/types'

// Columns, their names and types live in lib (the mock's event cards use them too); the hues are the pages'.
import { hueKey } from '@/lib/boardColumns'
import { statusLabel } from '@/lib/statuses'

export { statusLabel } from '@/lib/statuses'

type Pill = { pill: string; dot: string }
type Tint = { head: string; body: string; border: string; dot: string }

// The five standard columns keep their own hues; any other column takes its type's: grey, amber, emerald.
const statusStyle: Record<string, Pill> = {
  backlog: { pill: 'bg-surface-muted text-fg-secondary', dot: 'bg-fg-subtle' },
  todo: { pill: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', dot: 'bg-sky-500' },
  inProgress: { pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', dot: 'bg-amber-500' },
  inReview: { pill: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', dot: 'bg-violet-500' },
  done: { pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', dot: 'bg-emerald-500' },
}

/** Pastel column tints for the board, one per standard column (as the Opportunities board's stages). */
const statusTint: Record<string, Tint> = {
  backlog: { head: 'bg-surface-muted', body: 'bg-surface-sunken/60', border: 'border-line', dot: 'bg-fg-subtle' },
  todo: { head: 'bg-sky-50 dark:bg-sky-500/10', body: 'bg-sky-50/40 dark:bg-sky-500/[0.04]', border: 'border-sky-100 dark:border-sky-500/20', dot: 'bg-sky-400' },
  inProgress: { head: 'bg-amber-50 dark:bg-amber-500/10', body: 'bg-amber-50/40 dark:bg-amber-500/[0.04]', border: 'border-amber-100 dark:border-amber-500/20', dot: 'bg-amber-400' },
  inReview: { head: 'bg-violet-50 dark:bg-violet-500/10', body: 'bg-violet-50/40 dark:bg-violet-500/[0.04]', border: 'border-violet-100 dark:border-violet-500/20', dot: 'bg-violet-400' },
  done: { head: 'bg-emerald-50 dark:bg-emerald-500/10', body: 'bg-emerald-50/40 dark:bg-emerald-500/[0.04]', border: 'border-emerald-100 dark:border-emerald-500/20', dot: 'bg-emerald-400' },
}

/** A column's tint: a standard column's own while its type is the standard one's, else its type's. */
export const tintOf = (status: TicketStatus, category: StatusCategory): Tint => statusTint[hueKey(status, category)]!

/** Status pill with a dot (the record-status pill of the kit); `label` is the project's name for it, if it has one. */
export function StatusPill({ status, label, category = 'todo' }: { status: TicketStatus; label?: string; category?: StatusCategory }) {
  const style = statusStyle[hueKey(status, category)]!
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', style.pill)}>
      <span className={clsx('size-1.5 rounded-full', style.dot)} aria-hidden />
      {label ?? statusLabel(status)}
    </span>
  )
}

const priorityStyle: Record<Priority, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  high: { label: 'High', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  medium: { label: 'Medium', className: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  low: { label: 'Low', className: 'bg-surface-muted text-fg-tertiary' },
}

/** Priority as a small square chip. */
export function PriorityPill({ priority }: { priority: Priority }) {
  const style = priorityStyle[priority]
  return <span className={clsx('inline-flex items-center whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium', style.className)}>{style.label}</span>
}

/** A ticket key such as NEX-101: kept in its own direction and set in mono so it never reorders or jiggles. */
export function TicketKey({ value, className }: { value: string; className?: string }) {
  return (
    <bdi dir="ltr" className={clsx('font-mono text-xs tabular-nums', className)}>
      {value}
    </bdi>
  )
}

/** Story points: "5 pts", "1 pt", or — when not estimated. */
export const pointsLabel = (points: number | null) => (points === null ? '—' : `${points} ${points === 1 ? 'pt' : 'pts'}`)

/** Red "Overdue" chip: past its due date, or more hours logged than estimated. */
export function OverduePill() {
  return <span className="inline-flex items-center whitespace-nowrap rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">Overdue</span>
}

/** "Bug" chip for tasks of type bug. */
export function BugPill() {
  return <span className="inline-flex items-center whitespace-nowrap rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">Bug</span>
}

const tenth = (h: number) => Math.round(h * 10) / 10

/** Hours logged against the estimate: "4.5 / 6 h", "2 h" with no estimate, — when neither. */
export const hoursLabel = (logged: number, estimate: number | null) =>
  estimate !== null ? `${tenth(logged)} / ${tenth(estimate)} h` : logged > 0 ? `${tenth(logged)} h` : '—'
