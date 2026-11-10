import type { NewProject } from '@/api/types'

/** What the New/Edit project form holds; dates are yyyy-mm-dd, as date inputs give them. */

/** A link's address: https only. */
export const LINK_URL = /^https:\/\/[^\s]+$/
export type ProjectFormValues = Omit<NewProject, 'workspaceId'>
export type ProjectFormErrors = Partial<Record<keyof ProjectFormValues, string>>

const KEY = /^[A-Z]{2,5}$/

/** A key from a name: the first letter of each word (2 to 5), or a one-word name's first 3 letters. */
export function keyFromName(name: string): string {
  const words = name.toUpperCase().split(/[^A-Z]+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 3)
  return words.map((w) => w[0]).join('').slice(0, 5)
}

/** Field errors as sentences, the same ones the API sends. `takenKeys` are the workspace's other projects. */
export function validateProject(values: ProjectFormValues, takenKeys: string[]): ProjectFormErrors {
  const errors: ProjectFormErrors = {}
  if (!values.name.trim()) errors.name = 'Give the project a name.'
  if (!KEY.test(values.key)) errors.key = 'The key is 2 to 5 capital letters, such as NEX.'
  else if (takenKeys.includes(values.key)) errors.key = `Key ${values.key} is already used.`
  if (!values.managerId) errors.managerId = 'Pick a project manager.'
  if (!values.startDate) errors.startDate = 'Pick a start date.'
  if (!values.dueDate) errors.dueDate = 'Pick a due date.'
  else if (values.startDate && values.dueDate < values.startDate) errors.dueDate = 'The due date is before the start date.'
  if (values.links.some((l) => !l.label.trim())) errors.links = 'Give every link a label.'
  else if (values.links.some((l) => !LINK_URL.test(l.url.trim()))) errors.links = 'Links must start with https://.'
  return errors
}
