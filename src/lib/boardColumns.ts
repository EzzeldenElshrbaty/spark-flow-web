import type { BoardColumn, Project, StatusCategory } from '@/api/types'
import { CATEGORIES, DEFAULT_COLUMNS } from '@/lib/statuses'

const MAX_LABEL = 30
export const MAX_COLUMNS = 10

/** A project's columns, in board order: its own, or the standard five. */
export const columnsOf = (project: Pick<Project, 'board'>): BoardColumn[] => (project.board?.length ? project.board : DEFAULT_COLUMNS)

export const columnOf = (project: Pick<Project, 'board'>, status: string) => columnsOf(project).find((c) => c.id === status)

/** A status's type; a column that no longer exists reads as to do (open), never as done. */
export const categoryOf = (project: Pick<Project, 'board'>, status: string): StatusCategory => columnOf(project, status)?.category ?? 'todo'

/** What the project calls a status; — for a column that no longer exists. */
export const columnLabel = (project: Pick<Project, 'board'>, status: string) => columnOf(project, status)?.label ?? '—'

/** The first column of a type, in board order (a project always has one of each). */
export const firstOf = (project: Pick<Project, 'board'>, category: StatusCategory): BoardColumn =>
  columnsOf(project).find((c) => c.category === category) ?? DEFAULT_COLUMNS.find((c) => c.category === category)!

/** The columns with one moved to a place. */
export function moveColumn(columns: BoardColumn[], id: string, to: number): BoardColumn[] {
  const moving = columns.find((c) => c.id === id)
  if (!moving) return columns
  const rest = columns.filter((c) => c.id !== id)
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, moving)
  return rest
}

/** The first thing wrong with a board's columns, as the sentence to show; null when they are fine. */
export function columnErrors(columns: BoardColumn[]): string | null {
  if (columns.some((c) => !c.label.trim())) return 'Name each column.'
  if (columns.some((c) => c.label.trim().length > MAX_LABEL)) return `Keep column names under ${MAX_LABEL} characters.`
  const names = columns.map((c) => c.label.trim().toLowerCase())
  if (new Set(names).size !== names.length) return "Two columns can't share a name."
  if (CATEGORIES.some(({ category }) => !columns.some((c) => c.category === category))) return 'Each type needs at least one column.'
  if (columns.length > MAX_COLUMNS) return `A board can have up to ${MAX_COLUMNS} columns.`
  return null
}

/** Where a deleted column's tasks go unless the person picks: the first other column of its type, else the first other. */
export function defaultMoveTo(columns: BoardColumn[], id: string): string {
  const gone = columns.find((c) => c.id === id)
  const others = columns.filter((c) => c.id !== id)
  return (others.find((c) => c.category === gone?.category) ?? others[0])?.id ?? ''
}

/** Whether a column may be deleted: it isn't the last of its type. */
export const canDeleteColumn = (columns: BoardColumn[], id: string) => {
  const column = columns.find((c) => c.id === id)
  return Boolean(column) && columns.filter((c) => c.category === column!.category).length > 1
}
