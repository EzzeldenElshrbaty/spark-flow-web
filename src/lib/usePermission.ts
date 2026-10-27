import { accessOf, can, type Action, type PermissionContext, type ProjectRef, type ProjectScoped } from '@/lib/permissions'
import { useRole } from '@/lib/useRole'

type Extra = Omit<PermissionContext, 'userId' | 'role'>

/** `can` for the person using the app. Project-scoped actions need the project, as `can` does. */
export function usePermission() {
  const { persona } = useRole()
  function check(action: Exclude<Action, ProjectScoped>, extra?: Extra): boolean
  function check(action: ProjectScoped, extra: Extra & { project: ProjectRef }): boolean
  function check(action: Action, extra: Extra = {}): boolean {
    return can(action as Exclude<Action, ProjectScoped>, { userId: persona.id, role: persona.role, ...extra })
  }
  return check
}

/** loading / allowed / denied for one action: gated pages wait for the account (and any extra data) instead of refusing. */
export function useAccess(action: Exclude<Action, ProjectScoped>, extra: Extra = {}, extraLoading = false) {
  const { persona, loading } = useRole()
  return accessOf(loading || extraLoading, can(action, { userId: persona.id, role: persona.role, ...extra }))
}
