import type { ProjectRef } from '@/lib/permissions'
import { usePermission } from '@/lib/usePermission'

/**
 * Whether I may add time by hand on a project, as the server decides it: an Admin, or the project's manager (11 Nov
 * 2026). Everyone else on the project logs time with the timer.
 */
export function useCanAddTime() {
  const check = usePermission()
  return (project: ProjectRef | undefined) => Boolean(project && check('time.logFor', { project }))
}
