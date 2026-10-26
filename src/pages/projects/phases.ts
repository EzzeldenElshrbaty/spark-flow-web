import type { Phase, TaskView } from '@/api/types'
import type { Stage } from '@/components/ui/StageProgress'
import { isPastDue } from '@/lib/dates'

export type PhaseStage = Stage & { phase: Phase; taskCount: number; overdue: boolean }

const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export const byOrder = (phases: Phase[]) => [...phases].sort((a, b) => a.order - b.order)

/** One stage per phase, in order: "Done", or "Due 3 Oct"; overdue once its due day is over and it isn't done. */
export function stagesOf(phases: Phase[], tasks: TaskView[], now: Date): PhaseStage[] {
  return byOrder(phases).map((phase) => ({
    id: phase.id,
    label: phase.name,
    meta: phase.status === 'done' ? 'Done' : `Due ${shortDay(phase.dueDate)}`,
    phase,
    taskCount: tasks.filter((t) => t.phaseId === phase.id).length,
    overdue: phase.status !== 'done' && isPastDue(phase.dueDate, now),
  }))
}

function swap(ids: string[], id: string, by: -1 | 1) {
  const from = ids.indexOf(id)
  const to = from + by
  if (from < 0 || to < 0 || to >= ids.length) return ids
  const next = [...ids]
  ;[next[from], next[to]] = [next[to]!, next[from]!]
  return next
}
export const moveUp = (ids: string[], id: string) => swap(ids, id, -1)
export const moveDown = (ids: string[], id: string) => swap(ids, id, 1)
