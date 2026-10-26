import type { Role } from '@/lib/roles'

export type Persona = { id: string; name: string; title: string; role: Role }

// TODO(auth): until sign-in exists everyone is this sample user. Replace with the signed-in account, keeping the
// same shape as Spark CRM's useRole so the shell and pages don't change.
const sampleUser: Persona = { id: 'sample', name: 'Sample User', title: 'Management', role: 'Management' }

/** Who is using the app and the role that decides what they see. */
export function useRole() {
  return { persona: sampleUser, role: sampleUser.role }
}
