import { useState } from 'react'
import { useMe } from '@/api/users'
import type { Role } from '@/lib/roles'

export type Persona = { id: string; name: string; title: string; role: Role }

// Shown while the account loads (or if it fails), so menus still render.
const placeholder: Persona = { id: '', name: '', title: '', role: 'member' }

/** Who is using the app and the role that decides what they see. The persona comes from the API. */
export function useRole() {
  const { data, isPending, isFetching, error, refetch } = useMe()
  // A refetch with no data clears the query's error; keep the last one so Try again doesn't flash the pages meanwhile.
  const [lastError, setLastError] = useState<Error | null>(null)
  if (error && error !== lastError) setLastError(error as Error)
  if (data && lastError) setLastError(null)
  const persona: Persona = data ? { id: data.id, name: data.name, title: data.title, role: data.role } : placeholder
  const shownError = data ? null : ((error as Error | null) ?? (isFetching ? lastError : null))
  // loading: the persona is still the placeholder, so its role must not decide what is refused yet.
  // retrying: a failed account is being asked for again.
  return { persona, role: persona.role, loading: !data && isPending, error: shownError, retry: () => void refetch(), retrying: !data && isFetching }
}
