import type { BoardColumn, StatusCategory } from '@/api/types'

/** The board every project starts with; its ids are the statuses tasks had before columns could change. */
export const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: 'backlog', label: 'Backlog', category: 'todo' },
  { id: 'todo', label: 'To do', category: 'todo' },
  { id: 'inProgress', label: 'In progress', category: 'inProgress' },
  { id: 'inReview', label: 'In review', category: 'inProgress' },
  { id: 'done', label: 'Done', category: 'done' },
]

/** The three column types, in board order, with their names. */
export const CATEGORIES: { category: StatusCategory; label: string }[] = [
  { category: 'todo', label: 'To do' },
  { category: 'inProgress', label: 'In progress' },
  { category: 'done', label: 'Done' },
]

/** A default column's name, for places with no project at hand; any other id reads as — (never as the raw id). */
export const statusLabel = (status: string) => DEFAULT_COLUMNS.find((c) => c.id === status)?.label ?? '—'
