// The same role names as Spark CRM, so both apps speak one vocabulary.
export const roles = ['Management', 'Sales Manager', 'Salesperson', 'Lead Intake', 'Accountant', 'Presales'] as const

export type Role = (typeof roles)[number]
