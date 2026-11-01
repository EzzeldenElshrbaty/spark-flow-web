import { Link, useSearchParams } from 'react-router'
import type { ChatMessage, TaskEvent, User } from '@/api/types'
import { Tag } from '@/components/sf/Badge'
import { withInspector } from '@/lib/inspector'
import { statusLabel } from '@/lib/statuses'
import { TaskChip, type BodyContext } from '@/pages/chat/MessageBody'

const LABELS: Record<TaskEvent['kind'], string> = { created: 'Created', assigned: 'Assigned', status: 'Moved', done: 'Done' }

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

/**
 * The card a task change posts in its project's chat: the task (a live chip when I can see it), what happened, and to
 * whom or where.
 */
export function TaskEventCard({ message, users, ctx }: { message: ChatMessage; users: User[]; ctx: BodyContext }) {
  const [params] = useSearchParams()
  const event = message.taskEvent!
  const task = ctx.tasks.get(event.key)
  return (
    <div className="mt-1 max-w-[520px] rounded-sf-lg border border-sf-line bg-sf-surface p-3">
      <div className="flex items-center gap-2">
        {task ? (
          <TaskChip task={task} />
        ) : (
          <Link to={{ search: withInspector(params, { kind: 'ticket', key: event.key }).toString() }} className="sf-focus rounded-sf-sm font-mono text-[12px]/[18px] font-medium text-sf-text-secondary hover:underline">
            <bdi dir="ltr">{event.key}</bdi>
          </Link>
        )}
        <Tag tone={event.kind === 'done' ? 'accent' : 'default'}>{LABELS[event.kind]}</Tag>
      </div>
      <p className="sf-body mt-2 text-sf-text">{line(message, event, users) || '—'}</p>
    </div>
  )
}
