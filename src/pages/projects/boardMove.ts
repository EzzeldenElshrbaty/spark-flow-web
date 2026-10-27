import type { TaskView, TicketPatch, TicketStatus } from '@/api/types'

/** A card dropped on a column: the patch that moves it to the end of that column, or null when it stays put. */
export function boardMove(ticket: TaskView, to: TicketStatus, column: TaskView[]): TicketPatch | null {
  if (ticket.status === to) return null
  return { status: to, rank: Math.max(0, ...column.map((t) => t.rank)) + 1000 }
}
