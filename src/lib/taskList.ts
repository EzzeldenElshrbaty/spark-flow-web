import type { Project, TaskListEntry } from '@/api/types'
import { columnOf, firstOf } from '@/lib/boardColumns'

const added = (a: TaskListEntry, b: TaskListEntry) => a.addedAt.localeCompare(b.addedAt)
/** Soonest due first, no date last; the same date (or none) by when added. */
const byDue = (a: TaskListEntry, b: TaskListEntry) => {
  const x = a.task.dueAt
  const y = b.task.dueAt
  if (x !== y) {
    if (x === null) return 1
    if (y === null) return -1
    return x.localeCompare(y)
  }
  return added(a, b)
}

/**
 * A channel's task list in reading order (task list §2 Q5): the open tasks by due date, then the done ones as they were
 * added, for the Done fold.
 */
export function orderTaskList(entries: readonly TaskListEntry[]): { open: TaskListEntry[]; done: TaskListEntry[] } {
  return {
    open: entries.filter((e) => e.task.category !== 'done').sort(byDue),
    done: entries.filter((e) => e.task.category === 'done').sort(added),
  }
}

/** "4 open · 2 done", and the tab's count (the open ones). */
export function listCounts(entries: readonly TaskListEntry[]): { open: number; done: number } {
  const done = entries.filter((e) => e.task.category === 'done').length
  return { open: entries.length - done, done }
}

/**
 * Where unticking a task puts it (task list §2 Q6): the board's To do column, where new tasks start; or, when that
 * column was given another type, the first column of the To do type (final review).
 */
export function reopenColumn(project: Pick<Project, 'board'>): string {
  const todo = columnOf(project, 'todo')
  return todo?.category === 'todo' ? todo.id : firstOf(project, 'todo').id
}
