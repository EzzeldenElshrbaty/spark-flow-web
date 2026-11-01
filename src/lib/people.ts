import type { User } from '@/api/types'

// Who may be picked (Admin and help, slice 3). Deactivated people stay in the people list, so their names still show
// on what they did, but no picker offers them. Someone already chosen stays offered, so editing doesn't drop them.

/** Whether someone is active: not deactivated. */
export const isActive = (person: Pick<User, 'deactivated'>): boolean => !person.deactivated

/** The people a picker offers: everyone active, plus whoever is already chosen. */
export function pickable<T extends Pick<User, 'id' | 'deactivated'>>(people: readonly T[], chosen: Iterable<string | null | undefined> = []): T[] {
  const keep = new Set([...chosen].filter((id): id is string => Boolean(id)))
  return people.filter((p) => isActive(p) || keep.has(p.id))
}
