import { accessOf, can, type Action, type PermissionContext } from '@/lib/permissions'
import { useRole } from '@/lib/useRole'

/** `can` for the person using the app. */
export function usePermission() {
  const { persona } = useRole()
  return (action: Action, extra: Omit<PermissionContext, 'userId' | 'role'> = {}) =>
    can(action, { userId: persona.id, role: persona.role, ...extra })
}

/** loading / allowed / denied for one action: gated pages wait for the account instead of refusing. */
export function useAccess(action: Action, extra: Omit<PermissionContext, 'userId' | 'role'> = {}) {
  const { persona, loading } = useRole()
  return accessOf(loading, can(action, { userId: persona.id, role: persona.role, ...extra }))
}
