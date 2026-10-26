import type { Phase, TaskView } from '@/api/types'
import { byOrder } from './phases'

export type TaskFilter = { phase?: string | null; sprint?: string | null }
export type PhaseGroup = { phase: Phase | null; tasks: TaskView[] }

/** The Tasks tab's chips and sprint select: each narrows the list when set. */
export const filterTasks = (tasks: TaskView[], { phase, sprint }: TaskFilter) =>
  tasks.filter((t) => (!phase || t.phaseId === phase) && (!sprint || t.sprintId === sprint))

/** One group per phase in phase order, then "No phase" (also holding tasks whose phase is gone). */
export function groupByPhase(tasks: TaskView[], phases: Phase[]): PhaseGroup[] {
  const known = new Set(phases.map((p) => p.id))
  return [
    ...byOrder(phases).map((phase) => ({ phase, tasks: tasks.filter((t) => t.phaseId === phase.id) })),
    { phase: null, tasks: tasks.filter((t) => !t.phaseId || !known.has(t.phaseId)) },
  ]
}

const keys = new Intl.Collator('en', { numeric: true })

/** My open tasks: overdue first, then the nearest due date (none last), then by key. */
export const myOpenTasks = (tasks: TaskView[], userId: string) =>
  tasks
    .filter((t) => t.assigneeId === userId && t.status !== 'done')
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        (a.dueAt ?? '￿').localeCompare(b.dueAt ?? '￿') ||
        keys.compare(a.key, b.key),
    )

/** The Tasks tab's view: the address first, else the saved one if it is still a view (old saves said 'backlog'). */
export const viewOf = (asked: string | null, saved: string | undefined): 'board' | 'list' =>
  asked === 'board' || asked === 'list' ? asked : saved === 'list' || saved === 'board' ? saved : 'board'

/** A sprint filter only counts when that sprint exists, as an unknown phase doesn't. */
export const validSprint = (id: string | null, sprints: { id: string }[]) => (id && sprints.some((s) => s.id === id) ? id : null)
