import { useProjectSummaries } from '@/api/projects'
import { useTickets } from '@/api/tickets'
import { useMyDay } from '@/api/time'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'

/**
 * My timer (running, or paused today), labelled by its task (or project); null while there's none. The label is null
 * while what names it is still loading (UX Phase 4, 4.5: a pulse, never "—").
 */
export function useMyTimer() {
  const { workspace } = useCurrentWorkspace()
  const timer = useMyDay().data?.timer ?? null
  const tasks = useTickets(timer?.projectId)
  const projects = useProjectSummaries(workspace?.id)
  const taskId = timer && 'taskId' in timer.target ? timer.target.taskId : null
  const task = taskId ? tasks.data?.find((t) => t.id === taskId) : undefined
  const project = projects.data?.find((p) => p.id === timer?.projectId)
  const loading = projects.isPending || (taskId !== null && tasks.isPending)
  const label = task ? task.title : (project?.name ?? (loading ? null : '—'))
  return timer ? { timer, task, label } : null
}
