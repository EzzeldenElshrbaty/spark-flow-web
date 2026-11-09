import type { BoardColumn, Project, StatusCategory } from '@/api/types'
import { CATEGORIES, DEFAULT_COLUMNS } from '@/lib/statuses'

export const MAX_LABEL = 30
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

/** Where a new task starts: the To do column when the board has it, else the first To do-type column. */
export const startColumn = (project: Pick<Project, 'board'>): string => columnOf(project, 'todo')?.id ?? firstOf(project, 'todo').id

const HUE_OF_TYPE = { todo: 'backlog', inProgress: 'inProgress', done: 'done' } as const

/** Which hue a column wears: a standard column's own while its type is still the standard one's, else its type's. */
export function hueKey(id: string, category: StatusCategory): string {
  const standard = DEFAULT_COLUMNS.find((c) => c.id === id)
  return standard && standard.category === category ? id : HUE_OF_TYPE[category]
}

/** How many tasks sit in a column, archived ones included (deleting the column moves all of them). */
export const columnTaskCount = (all: { status: string }[], archived: { status: string }[], id: string) =>
  [...all, ...archived].filter((t) => t.status === id).length

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
  return columnProblem(columns)?.message ?? null
}

/** The first thing wrong with a board, and what it's about: a column's name, the types, or the board's size (UX Phase 4). */
export function columnProblem(columns: BoardColumn[]): { field: 'label' | 'category' | 'board'; message: string } | null {
  if (columns.some((c) => !c.label.trim())) return { field: 'label', message: 'Name each column.' }
  if (columns.some((c) => c.label.trim().length > MAX_LABEL)) return { field: 'label', message: `Keep column names under ${MAX_LABEL} characters.` }
  const names = columns.map((c) => c.label.trim().toLowerCase())
  if (new Set(names).size !== names.length) return { field: 'label', message: 'Two columns can’t share a name.' }
  if (CATEGORIES.some(({ category }) => !columns.some((c) => c.category === category))) return { field: 'category', message: 'Each type needs at least one column.' }
  if (columns.length > MAX_COLUMNS) return { field: 'board', message: `A board can have up to ${MAX_COLUMNS} columns.` }
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

/**
 * What a change of type does to a column's tasks (UX Phase 4, 4.10): only Done matters — progress, overdue and timers
 * follow it. `place` names the column they move to (Delete column); null when nothing changes or there are no tasks.
 */
export function doneChange(from: StatusCategory, to: StatusCategory, count: number, place?: string): string | null {
  if (count === 0 || (from === 'done') === (to === 'done')) return null
  const tasks = `${count} ${count === 1 ? 'task' : 'tasks'} ${place ? `moved to ${place}` : 'here'}`
  return to === 'done' ? `${tasks} will count as done.` : `${tasks} will stop counting as done.`
}
