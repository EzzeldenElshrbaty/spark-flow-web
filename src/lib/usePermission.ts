import { can, type Action, type PermissionContext } from '@/lib/permissions'
import { useRole } from '@/lib/useRole'

/** `can` for the person using the app. */
export function usePermission() {
  const { persona } = useRole()
  return (action: Action, extra: Omit<PermissionContext, 'userId' | 'role'> = {}) =>
    can(action, { userId: persona.id, role: persona.role, ...extra })
}
