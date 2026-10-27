import { Link, useSearchParams } from 'react-router'
import type { ChatMessage, TaskEvent, User } from '@/api/types'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { withInspector } from '@/lib/inspector'
import { statusLabel } from '@/lib/statuses'
import { TicketKey } from '@/pages/projects/ticketPills'

const badge = (event: TaskEvent): { tone: BadgeTone; label: string } => {
  if (event.kind === 'created') return { tone: 'neutral', label: 'Created' }
  if (event.kind === 'assigned') return { tone: 'info', label: 'Assigned' }
  if (event.kind === 'done') return { tone: 'success', label: 'Done' }
  return { tone: 'warning', label: 'Moved' }
}

/** What the card says under its badge, from the event (not the stored text, which is for search). */
function line(message: ChatMessage, event: TaskEvent, users: User[]) {
  if (event.kind === 'assigned') return `To ${users.find((u) => u.id === event.assigneeId)?.name ?? 'someone'}`
  // The column's name as the project called it then: "Moved NEX-1 to Ready to ship". Older cards kept it in the text only.
  if (event.kind === 'status') {
    if (event.statusLabel) return `Moved to ${event.statusLabel}`
    const prefix = `Moved ${event.key} to `
    return `Moved to ${message.content.startsWith(prefix) ? message.content.slice(prefix.length) : statusLabel(event.status ?? 'todo')}`
  }
  // "Created NEX-1: title" / "Done: NEX-1 title": the title is what follows the key.
  const at = message.content.indexOf(event.key)
  return at >= 0 ? message.content.slice(at + event.key.length).replace(/^:?\s*/, '') : ''
}

/** The card a task change posts in its project's chat: the task, what happened, and to whom or where. */
export function TaskEventCard({ message, users }: { message: ChatMessage; users: User[] }) {
  const [params] = useSearchParams()
  const event = message.taskEvent!
  const { tone, label } = badge(event)
  return (
    <div className="mt-1 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <Link to={{ search: withInspector(params, { kind: 'ticket', key: event.key }).toString() }} className="hover:underline">
          <TicketKey value={event.key} className="text-fg-secondary" />
        </Link>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="mt-1.5 text-sm text-fg">{line(message, event, users) || '—'}</p>
    </div>
  )
}
