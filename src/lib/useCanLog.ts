import type { ProjectRef } from '@/lib/permissions'
import { useMe } from '@/api/users'
import { usePermission } from '@/lib/usePermission'

/** Whether I may log time on a project (I'm on it, or an Admin), as the server decides it; false until I'm known. */
export function useCanLog() {
  const me = useMe().data
  const check = usePermission()
  return (project: ProjectRef | undefined) => Boolean(project && me && check('time.logOn', { project, userTeamIds: me.teamIds }))
}
