import type { BoardColumn, Project, TicketStatus } from '@/api/types'
import { statuses } from '@/lib/statuses'

const MAX_LABEL = 30

/** A project's board: its 5 statuses once each, in its order and with its names; whatever is missing comes from the standard board. */
export function boardColumns(project: Pick<Project, 'board'>): BoardColumn[] {
  const seen = new Set<TicketStatus>()
  const own: BoardColumn[] = []
  for (const c of project.board ?? []) {
    const standard = statuses.find((s) => s.status === c.status)
    if (!standard || seen.has(c.status)) continue
    seen.add(c.status)
    own.push({ status: c.status, label: c.label.trim() || standard.label })
  }
  return [...own, ...statuses.filter((s) => !seen.has(s.status)).map((s) => ({ ...s }))]
}

/** What the project calls a status. */
export const columnLabel = (project: Pick<Project, 'board'>, status: TicketStatus) => boardColumns(project).find((c) => c.status === status)!.label

/** The columns with one moved to a place. */
export function moveColumn(columns: BoardColumn[], status: TicketStatus, to: number): BoardColumn[] {
  const moving = columns.find((c) => c.status === status)
  if (!moving) return columns
  const rest = columns.filter((c) => c.status !== status)
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, moving)
  return rest
}

/** The first thing wrong with a board's columns, as the sentence to show; null when they are fine. */
export function columnErrors(columns: BoardColumn[]): string | null {
  if (columns.some((c) => !c.label.trim())) return 'Name each column.'
  if (columns.some((c) => c.label.trim().length > MAX_LABEL)) return `Keep column names under ${MAX_LABEL} characters.`
  const names = columns.map((c) => c.label.trim().toLowerCase())
  if (new Set(names).size !== names.length) return "Two columns can't share a name."
  const kinds = new Set(columns.map((c) => c.status))
  if (columns.length !== statuses.length || kinds.size !== statuses.length || statuses.some((s) => !kinds.has(s.status))) return 'Every status needs one column.'
  return null
}
