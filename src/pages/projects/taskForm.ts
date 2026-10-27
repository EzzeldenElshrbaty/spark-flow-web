import type { Project, TaskView, TicketPatch, User } from '@/api/types'
import { categoryOf } from '@/lib/boardColumns'

/**
 * The fields of an edit that differ from the task as it was opened. Only these are sent, so a save doesn't put back
 * what someone else changed meanwhile (a status moved on the board, say).
 */
export function changedFields(task: TaskView, fields: TicketPatch): TicketPatch {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== (task as Record<string, unknown>)[key])) as TicketPatch
}

/**
 * The Assignee choices: the project's people, and first the task's current assignee when they aren't one of them, so
 * that a save doesn't quietly unassign someone taken off the project.
 */
export function assigneeOptions(people: User[], users: User[], currentId: string | null): { id: string; label: string }[] {
  const options = people.map((u) => ({ id: u.id, label: u.name }))
  if (!currentId || people.some((u) => u.id === currentId)) return options
  const name = users.find((u) => u.id === currentId)?.name ?? 'Unknown person'
  return [{ id: currentId, label: `${name} (not on this project)` }, ...options]
}

/** The warning when people are removed from a project while open tasks are still theirs; null when there's none. */
export function tasksLeftWith(removedIds: string[], tasks: TaskView[], project: Pick<Project, 'board'>, users: User[]): string | null {
  const open = tasks.filter((t) => t.assigneeId && removedIds.includes(t.assigneeId) && categoryOf(project, t.status) !== 'done')
  if (open.length === 0) return null
  const names = removedIds.filter((id) => open.some((t) => t.assigneeId === id)).map((id) => users.find((u) => u.id === id)?.name ?? 'Someone')
  const who =
    names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]} and ${names.length - 2} ${names.length === 3 ? 'other' : 'others'}`
  const count = open.length === 1 ? '1 open task' : `${open.length} open tasks`
  return `${who} ${names.length === 1 ? 'keeps' : 'keep'} ${count} here. Reassign ${open.length === 1 ? 'it' : 'them'} from the board.`
}

