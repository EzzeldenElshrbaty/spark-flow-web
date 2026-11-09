import type { Project, TaskView, TicketPatch, User } from '@/api/types'
import { pickable } from '@/lib/people'
import { categoryOf } from '@/lib/boardColumns'

/**
 * The fields of an edit that differ from the task as it was opened. Only these are sent, so a save doesn't put back
 * what someone else changed meanwhile (a status moved on the board, say).
 */
export function changedFields(task: TaskView, fields: TicketPatch): TicketPatch {
  const was = task as Record<string, unknown>
  // The form keeps a due date as a day (midnight UTC); a stored one may carry a time, which is the same day.
  const same = (key: string, value: unknown) =>
    key === 'dueAt' && typeof value === 'string' && typeof was.dueAt === 'string'
      ? value.slice(0, 10) === was.dueAt.slice(0, 10)
      : // A description and a file list are values: equal when they hold the same.
        key === 'descriptionBody' || key === 'attachmentIds'
        ? JSON.stringify(value) === JSON.stringify(was[key])
        : value === was[key]
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => !same(key, value))) as TicketPatch
}

/** What a task sheet's save sends: what changed, and for someone who may only move the task, just its status. */
export function savePatch(opened: TaskView, fields: TicketPatch, canManage: boolean): TicketPatch {
  return changedFields(opened, canManage ? fields : { status: fields.status })
}

/**
 * The Assignee choices: the project's people, and first the task's current assignee when they aren't one of them, so
 * that a save doesn't quietly unassign someone taken off the project.
 */
export function assigneeOptions(people: User[], users: User[], currentId: string | null): { id: string; label: string }[] {
  // Nobody deactivated (slice 3), unless the task is theirs already: it stays with them until it's reassigned.
  const options = pickable(people, [currentId]).map((u) => ({ id: u.id, label: u.deactivated ? `${u.name} (deactivated)` : u.name }))
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

/** What a task needs before it saves: a title, and an estimate (when given) of 0 hours or more. */
export function taskFormErrors(values: { title: string; estimate: string }): { title?: string; estimate?: string } {
  const estimate = values.estimate.trim() === '' ? null : Number(values.estimate)
  return {
    title: values.title.trim() ? undefined : 'Give the task a title.',
    estimate: estimate !== null && (!Number.isFinite(estimate) || estimate < 0) ? 'The estimate is 0 hours or more.' : undefined,
  }
}
