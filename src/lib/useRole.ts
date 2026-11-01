import { useMe } from '@/api/users'
import type { Permission } from '@/lib/permissions'
import { useShownError } from '@/lib/useShownError'

/** Who is using the app: the roles they hold, and every permission those give them (slice 1). */
export type Persona = { id: string; name: string; title: string; roleIds: string[]; grants: Permission[] }

// Shown while the account loads (or if it fails), so menus still render.
const placeholder: Persona = { id: '', name: '', title: '', roleIds: [], grants: [] }

/** Who is using the app and the permissions that decide what they see. The persona comes from the API. */
export function useRole() {
  const me = useMe()
  const { data, isPending, isFetching, refetch } = me
  // Lasts through Try again, so the shell doesn't flash the pages while the account is asked for again.
  const error = useShownError(me)
  const persona: Persona = data ? { id: data.id, name: data.name, title: data.title, roleIds: data.roleIds ?? [], grants: data.grants ?? [] } : placeholder
  // loading: the persona is still the placeholder (no permissions), so it must not decide what is refused yet.
  // retrying: a failed account is being asked for again.
  return { persona, grants: persona.grants, loading: !data && isPending, error, retry: () => void refetch(), retrying: !data && isFetching }
}
