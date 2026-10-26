// The company system's roles (spec §4.3). A project manager is also whoever a project names as its manager.
export const roles = ['admin', 'sales', 'pm', 'member'] as const

export type Role = (typeof roles)[number]

export const roleLabels: Record<Role, string> = { admin: 'Admin', sales: 'Sales', pm: 'Project manager', member: 'Member' }
