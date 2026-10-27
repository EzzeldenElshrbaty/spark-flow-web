import type { TicketStatus } from '@/api/types'

/** Board order and standard name of each status; the pages and the mock (event cards) share it. */
export const statuses: { status: TicketStatus; label: string }[] = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'todo', label: 'To do' },
  { status: 'inProgress', label: 'In progress' },
  { status: 'inReview', label: 'In review' },
  { status: 'done', label: 'Done' },
]

export const statusLabel = (status: TicketStatus) => statuses.find((s) => s.status === status)?.label ?? status
