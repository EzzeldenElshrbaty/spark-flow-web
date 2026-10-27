import type { TaskView, TicketPatch, TicketStatus } from '@/api/types'

const STEP = 1000

/**
 * A card dropped at `index` among the other cards of column `to` (`column` in rank order; it may hold the card):
 * the patch that puts it there, ranked between its new neighbours, or null when it ends where it was.
 */
export function boardMove(ticket: TaskView, to: TicketStatus, column: TaskView[], index: number): TicketPatch | null {
  const others = column.filter((t) => t.key !== ticket.key)
  const at = Math.max(0, Math.min(index, others.length))
  if (ticket.status === to && column.findIndex((t) => t.key === ticket.key) === at) return null
  const before = others[at - 1]
  const after = others[at]
  const rank = before && after ? (before.rank + after.rank) / 2 : before ? before.rank + STEP : after ? after.rank - STEP : STEP
  return ticket.status === to ? { rank } : { status: to, rank }
}
