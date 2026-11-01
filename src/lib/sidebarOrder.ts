import { mutedLast } from '@/lib/channels'
export type { SidebarOrder, SidebarSection } from '@/api/types'

/**
 * A section's rows in my order (spec 5.1): the saved ids first, as saved; then any row the order doesn't know (joined
 * or starred later) in its default place; muted rows last, keeping that order (spec 6.11).
 */
export function applyOrder<T>(rows: T[], saved: string[] | undefined, idOf: (row: T) => string, isMuted: (row: T) => boolean): T[] {
  if (!saved?.length) return mutedLast(rows, isMuted)
  const rank = new Map(saved.map((id, i) => [id, i]))
  const known = rows.filter((r) => rank.has(idOf(r))).sort((a, b) => rank.get(idOf(a))! - rank.get(idOf(b))!)
  return mutedLast([...known, ...rows.filter((r) => !rank.has(idOf(r)))], isMuted)
}

/**
 * The section's ids after dropping `activeId` where `overId` is, or null when nothing changes: a drop on itself, on
 * nothing, or across the line between unmuted and muted rows (a muted row stays among the muted).
 */
export function moveInOrder(ids: string[], activeId: string, overId: string | null, mutedIds: ReadonlySet<string>): string[] | null {
  if (!overId || overId === activeId || mutedIds.has(activeId) !== mutedIds.has(overId)) return null
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  if (from < 0 || to < 0) return null
  const next = [...ids]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}
