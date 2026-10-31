import type { NewPerson, PersonRow, Role, Team } from '@/api/types'

// How Settings → Users reads the address and the server's refusals (Admin and help, slice 3).

export type UsersFilter = { q: string; role: string; team: string; status: '' | 'active' | 'deactivated' }

/** The filter the address asks for (?q=&role=&team=&status=), anything unknown left out. */
export function usersFilterFrom(params: URLSearchParams): UsersFilter {
  const status = params.get('status')
  return {
    q: params.get('q')?.trim() ?? '',
    role: params.get('role') ?? '',
    team: params.get('team') ?? '',
    status: status === 'active' || status === 'deactivated' ? status : '',
  }
}

/** The people a filter keeps, active first, then by name. Words match a name, an email or a title. */
export function filterPeople(people: readonly PersonRow[], f: UsersFilter): PersonRow[] {
  const q = f.q.toLowerCase()
  return people
    .filter((p) => !q || [p.name, p.email, p.title].some((t) => t.toLowerCase().includes(q)))
    .filter((p) => !f.role || p.roleIds.includes(f.role))
    .filter((p) => !f.team || p.teamIds.includes(f.team))
    .filter((p) => !f.status || (f.status === 'active') === !p.deactivated)
    .sort((a, b) => Number(Boolean(a.deactivated)) - Number(Boolean(b.deactivated)) || a.name.localeCompare(b.name))
}

/** "Admin, Project manager", in the roles' own order; "—" for none. */
export const roleNames = (roles: readonly Pick<Role, 'id' | 'name'>[], ids: readonly string[]) => roles.filter((r) => ids.includes(r.id)).map((r) => r.name).join(', ') || '—'

/** "Backend, QA"; "—" for none. */
export const teamNames = (teams: readonly Pick<Team, 'id' | 'name'>[], ids: readonly string[]) => teams.filter((t) => ids.includes(t.id)).map((t) => t.name).join(', ') || '—'

/** Which field a refusal is about, so it shows under that field; null for one about the whole form. */
export function fieldOf(message: string): keyof NewPerson | null {
  if (/name/i.test(message) && !/email/i.test(message)) return 'name'
  if (/email/i.test(message)) return 'email'
  if (/title/i.test(message)) return 'title'
  if (/role|settings, users and roles/i.test(message)) return 'roleIds'
  if (/team/i.test(message)) return 'teamIds'
  return null
}
