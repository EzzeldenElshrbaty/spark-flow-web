import type { TaskView, TicketPatch } from '@/api/types'

/**
 * The fields of an edit that differ from the task as it was opened. Only these are sent, so a save doesn't put back
 * what someone else changed meanwhile (a status moved on the board, say).
 */
export function changedFields(task: TaskView, fields: TicketPatch): TicketPatch {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== (task as Record<string, unknown>)[key])) as TicketPatch
}
