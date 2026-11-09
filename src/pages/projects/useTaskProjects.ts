import { useProjectSummaries } from '@/api/projects'
import type { ProjectSummary } from '@/api/types'
import { usePermission } from '@/lib/usePermission'

/**
 * The projects I may add tasks to, in their order: never an archived one. The sidebar's New task and /task in a
 * channel with no project both offer these. Undefined while the projects load, so a caller can tell that from none.
 */
export function useTaskProjects(workspaceId: string | undefined): ProjectSummary[] | undefined {
  const check = usePermission()
  const summaries = useProjectSummaries(workspaceId).data
  return summaries?.filter((project) => !project.archivedAt && check('task.manage', { project }))
}
