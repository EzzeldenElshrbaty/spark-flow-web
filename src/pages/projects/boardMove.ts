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

/** A drop, ranked against the whole column (hidden cards too), and the column renumbered when its ranks ran out. */
export type BoardDrop = { patch: TicketPatch; renumber: { key: string; rank: number }[] }

/**
 * A card dropped at `index` among the cards shown in column `to` (`shown`, maybe filtered). It goes right before the
 * shown card at `index` (or right after the last shown one) in the whole column `full`, so it never ties with a hidden
 * card. When its neighbours' ranks are too close to split, every card of the column is renumbered 1000, 2000, … in
 * that order. null when it ends where it was.
 */
export function boardDrop(ticket: TaskView, to: TicketStatus, shown: TaskView[], full: TaskView[], index: number): BoardDrop | null {
  const otherShown = shown.filter((t) => t.key !== ticket.key)
  const others = full.filter((t) => t.key !== ticket.key)
  const at = Math.max(0, Math.min(index, otherShown.length))
  const place = at < otherShown.length ? others.indexOf(otherShown[at]!) : otherShown.length ? others.indexOf(otherShown.at(-1)!) + 1 : others.length
  if (ticket.status === to && full.findIndex((t) => t.key === ticket.key) === place) return null
  const before = others[place - 1]
  const after = others[place]
  const withStatus = (rank: number): TicketPatch => (ticket.status === to ? { rank } : { status: to, rank })
  if (before && after && after.rank - before.rank < 1e-6) {
    const order = [...others.slice(0, place), ticket, ...others.slice(place)]
    const renumber = order.map((t, i) => ({ key: t.key, rank: (i + 1) * STEP })).filter((r, i) => r.key !== ticket.key && order[i]!.rank !== r.rank)
    return { patch: withStatus((place + 1) * STEP), renumber }
  }
  const rank = before && after ? (before.rank + after.rank) / 2 : before ? before.rank + STEP : after ? after.rank - STEP : STEP
  return { patch: withStatus(rank), renumber: [] }
}

/** Drops shown before the server has them, by task key, with the version of the task each was made on. */
export type PendingMoves = Record<string, { patch: TicketPatch; updatedAt: string }>

/** The tasks as the board shows them: each pending drop applied over the server's copy. */
export const withPending = (tickets: TaskView[], pending: PendingMoves): TaskView[] =>
  tickets.map((t) => (pending[t.key] ? { ...t, ...pending[t.key]!.patch } : t))

/** Pending drops still waiting: one goes once its task is gone or the server's copy changed (the save, or someone else's). */
export function prunePending(pending: PendingMoves, tickets: TaskView[]): PendingMoves {
  const kept: PendingMoves = {}
  for (const [key, move] of Object.entries(pending)) {
    const now = tickets.find((t) => t.key === key)
    if (now && now.updatedAt === move.updatedAt) kept[key] = move
  }
  return kept
}
