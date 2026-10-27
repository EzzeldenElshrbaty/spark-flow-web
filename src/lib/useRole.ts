import { useMe } from '@/api/users'
import type { Role } from '@/lib/roles'
import { useShownError } from '@/lib/useShownError'

export type Persona = { id: string; name: string; title: string; role: Role }

// Shown while the account loads (or if it fails), so menus still render.
const placeholder: Persona = { id: '', name: '', title: '', role: 'member' }

/** Who is using the app and the role that decides what they see. The persona comes from the API. */
export function useRole() {
  const me = useMe()
  const { data, isPending, isFetching, refetch } = me
  // Lasts through Try again, so the shell doesn't flash the pages while the account is asked for again.
  const error = useShownError(me)
  const persona: Persona = data ? { id: data.id, name: data.name, title: data.title, role: data.role } : placeholder
  // loading: the persona is still the placeholder, so its role must not decide what is refused yet.
  // retrying: a failed account is being asked for again.
  return { persona, role: persona.role, loading: !data && isPending, error, retry: () => void refetch(), retrying: !data && isFetching }
}
