import { useProjectSummaries } from '@/api/projects'
import { useTickets } from '@/api/tickets'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useCanLog } from '@/lib/useCanLog'

/**
 * What time can go on: the workspace's projects I'm on (or every one, for an Admin), since the server refuses the
 * others, plus `keepProjectId` (an entry's own project, while it's edited), and `projectId`'s tasks. `loaded` is false
 * until the projects are known.
 */
export function useLogTargets(projectId: string, keepProjectId?: string) {
  const { workspace } = useCurrentWorkspace()
  const canLog = useCanLog()
  const summaries = useProjectSummaries(workspace?.id).data
  const projects = (summaries ?? []).filter((p) => canLog(p) || p.id === keepProjectId)
  const tasks = useTickets(projectId || undefined).data ?? []
  return { projects, tasks, loaded: summaries !== undefined }
}
