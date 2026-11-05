import { useProjectSummaries } from '@/api/projects'
import { useTickets } from '@/api/tickets'
import { useMyDay } from '@/api/time'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'

/** My timer (running, or paused today), labelled by its task (or project); null while there's none. */
export function useMyTimer() {
  const { workspace } = useCurrentWorkspace()
  const timer = useMyDay().data?.timer ?? null
  const tasks = useTickets(timer?.projectId)
  const projects = useProjectSummaries(workspace?.id)
  const taskId = timer && 'taskId' in timer.target ? timer.target.taskId : null
  const task = taskId ? tasks.data?.find((t) => t.id === taskId) : undefined
  const project = projects.data?.find((p) => p.id === timer?.projectId)
  return timer ? { timer, task, label: task ? task.title : (project?.name ?? '—') } : null
}
