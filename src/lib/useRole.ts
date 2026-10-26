import { useMe } from '@/api/users'
import type { Role } from '@/lib/roles'

export type Persona = { id: string; name: string; title: string; role: Role }

// Shown while the account loads (or if it fails), so menus still render.
const placeholder: Persona = { id: '', name: '', title: '', role: 'Management' }

/** Who is using the app and the role that decides what they see. The persona comes from the API. */
export function useRole() {
  const { data } = useMe()
  const persona: Persona = data ? { id: data.id, name: data.name, title: data.title, role: data.role } : placeholder
  return { persona, role: persona.role }
}
