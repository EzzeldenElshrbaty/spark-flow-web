import type { ChatMessage, TaskEvent, Ticket } from '@/api/types'
import { statusLabel } from '@/lib/statuses'
import { postMessage } from './chat'
import type { DbData } from './db'

/** What a task change says in its project's chat: created; assigned to a person; a new status (done is its own). */
export function taskEventOf(before: Ticket | null, after: Ticket): TaskEvent[] {
  if (!before) return [{ key: after.key, kind: 'created' }]
  const events: TaskEvent[] = []
  if (after.assigneeId && after.assigneeId !== before.assigneeId) events.push({ key: after.key, kind: 'assigned', assigneeId: after.assigneeId })
  if (after.status !== before.status) events.push({ key: after.key, kind: after.status === 'done' ? 'done' : 'status', status: after.status })
  return events
}

/** The card's text, kept for search and excerpts; the page draws the card from `taskEvent`. */
function textOf(data: DbData, event: TaskEvent, task: Ticket): string {
  switch (event.kind) {
    case 'created':
      return `Created ${task.key}: ${task.title}`
    case 'assigned':
      return `Assigned ${task.key} to ${data.users.find((u) => u.id === event.assigneeId)?.name ?? 'someone'}`
    case 'status':
      return `Moved ${task.key} to ${statusLabel(event.status!)}`
    case 'done':
      return `Done: ${task.key} ${task.title}`
  }
}

/**
 * Posts one card per event in the task's project chat, inside the caller's transaction. Cards name their task but
 * mention nobody, so they don't ring the bell.
 */
export function postTaskEvents(data: DbData, before: Ticket | null, after: Ticket): ChatMessage[] {
  const project = data.projects.find((p) => p.id === after.projectId)
  if (!project) return []
  return taskEventOf(before, after).map((event) => {
    const card = postMessage(data, { channelId: project.channelId, content: textOf(data, event, after) }, { taskEvent: event })
    card.mentions = []
    card.linkedTicketKeys = [after.key]
    return card
  })
}
