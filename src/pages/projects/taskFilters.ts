import type { Phase, Priority, TaskType, TaskView } from '@/api/types'
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
const byDue = (a: TaskView, b: TaskView) => (a.dueAt ?? '￿').localeCompare(b.dueAt ?? '￿') || keys.compare(a.key, b.key)
/** Needs attention first (kit rule 7): overdue, then over its estimate, then the nearest due date (none last), then by key. */
const byAttention = (a: TaskView, b: TaskView) => Number(b.overdue) - Number(a.overdue) || Number(b.overEstimate) - Number(a.overEstimate) || byDue(a, b)

/** My open tasks, needing attention first. */
export const myOpenTasks = (tasks: TaskView[], userId: string) => tasks.filter((t) => t.assigneeId === userId && t.category !== 'done').sort(byAttention)

// ── Search, filters and sort (UX Phase 4, 4.2) ─────────────────────────────────

/** The Tasks tab's search and filters, from the address (`q`, `assignee`: me, none or a person's id, `priority`, `type`). */
export type TaskQuery = { q?: string; assignee?: string; priority?: Priority; type?: TaskType }
export const PRIORITIES: [Priority, string][] = [
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
]
const TYPES: TaskType[] = ['task', 'bug']

export function taskQueryFrom(params: URLSearchParams): TaskQuery {
  const priority = params.get('priority') as Priority | null
  const type = params.get('type') as TaskType | null
  return {
    q: params.get('q') ?? undefined,
    assignee: params.get('assignee') ?? undefined,
    priority: priority && PRIORITIES.some(([p]) => p === priority) ? priority : undefined,
    type: type && TYPES.includes(type) ? type : undefined,
  }
}

/** Whether a task matches the search (its key or title, any case) and each filter that is on. */
export function matchesQuery(t: TaskView, { q, assignee, priority, type }: TaskQuery, meId: string): boolean {
  const words = q?.trim().toLowerCase()
  if (words && !t.key.toLowerCase().includes(words) && !t.title.toLowerCase().includes(words)) return false
  if (assignee && t.assigneeId !== (assignee === 'me' ? meId : assignee === 'none' ? null : assignee)) return false
  return (!priority || t.priority === priority) && (!type || t.type === type)
}

/** How many filters are on, phase and sprint included: Clear filters shows while any are. */
export const activeFilters = (query: TaskQuery, { phase, sprint }: TaskFilter) =>
  [query.q?.trim(), query.assignee, query.priority, query.type, phase, sprint].filter(Boolean).length

/** The List view's orders; Needs attention first is the default, board order is the board's columns and ranks. */
export type TaskSort = 'attention' | 'board' | 'due' | 'priority' | 'updated'
export const TASK_SORTS: { value: TaskSort; label: string }[] = [
  { value: 'attention', label: 'Needs attention first' },
  { value: 'board', label: 'Board order' },
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'updated', label: 'Recently updated' },
]
export const sortOf = (asked: string | null): TaskSort => TASK_SORTS.find((s) => s.value === asked)?.value ?? 'attention'

const rank = (p: Priority) => PRIORITIES.findIndex(([value]) => value === p)
const orders: Record<Exclude<TaskSort, 'board'>, (a: TaskView, b: TaskView) => number> = {
  attention: byAttention,
  due: byDue,
  priority: (a, b) => rank(a.priority) - rank(b.priority) || byAttention(a, b),
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
}

/** Tasks in a List order; board order keeps the order given. */
export const sortTasks = (tasks: TaskView[], sort: TaskSort) => (sort === 'board' ? [...tasks] : [...tasks].sort(orders[sort]))

/** The Tasks tab's view: the address first, else the saved one if it is still a view (old saves said 'backlog'). */
export const viewOf = (asked: string | null, saved: string | undefined): 'board' | 'list' =>
  asked === 'board' || asked === 'list' ? asked : saved === 'list' || saved === 'board' ? saved : 'board'

/** A sprint filter only counts when that sprint exists, as an unknown phase doesn't. */
export const validSprint = (id: string | null, sprints: { id: string }[]) => (id && sprints.some((s) => s.id === id) ? id : null)

/** The tasks I may start a timer on: the server refuses time on a project I'm not on (`time.logOn`). */
export const loggableTasks = (tasks: TaskView[], canLogOn: (projectId: string) => boolean) => tasks.filter((t) => canLogOn(t.projectId))

/**
 * Whether ?archived=1 should go: the project has no archived tasks at all (the toggle is gone), so the next task
 * archived doesn't appear with it already on. `archivedCount` is unfiltered; undefined while it loads.
 */
export function staleArchivedParam(asked: boolean, archivedCount: number | undefined): boolean {
  return asked && archivedCount === 0
}

/**
 * The Tasks tab's phase and sprint: each from the address when it's there, else the one last picked on this project
 * (so picking a phase doesn't drop a remembered sprint).
 */
export function filtersFrom(params: URLSearchParams, last: { phase?: string; sprint?: string } | undefined): { phase: string | null; sprint: string | null } {
  return {
    phase: params.has('phase') ? params.get('phase') : (last?.phase ?? null),
    sprint: params.has('sprint') ? params.get('sprint') : (last?.sprint ?? null),
  }
}

