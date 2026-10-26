import { MessageSquare } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import type { ChatMessage, Reaction, ThreadReply, User } from '@/api/types'
import { AttachmentView } from '@/components/AttachmentView'
import { MentionText } from '@/components/MentionText'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { formatWhen, timeAgo } from '@/lib/format'
import { withInspector } from '@/lib/inspector'
import { TicketKey } from '@/pages/projects/ticketPills'

/** Reaction pills: the emoji is the people's own content, the count is ours. */
function Reactions({ reactions, users }: { reactions: Reaction[]; users: User[] }) {
  const shown = reactions.filter((reaction) => reaction.userIds.length > 0)
  if (shown.length === 0) return null
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {shown.map((reaction) => (
        <li
          key={reaction.emoji}
          title={reaction.userIds.map((id) => users.find((u) => u.id === id)?.name ?? 'Unknown person').join(', ')}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-xs text-fg-secondary"
        >
          <span>{reaction.emoji}</span>
          <span className="tabular-nums">{reaction.userIds.length}</span>
        </li>
      ))}
    </ul>
  )
}

const CARD = /^(Bug|Comment) on ([A-Z]{2,5}-\d+)(?:: |$)/

/** The card a task comment or bug posts in its project's chat: the task, the kind, the text and its files. */
function CommentCard({ message }: { message: ChatMessage }) {
  const [params] = useSearchParams()
  const match = CARD.exec(message.content)
  const bug = match?.[1] === 'Bug'
  const key = match?.[2] ?? message.linkedTicketKeys[0]
  const body = match ? message.content.slice(match[0].length) : message.content
  return (
    <div className="mt-1 rounded-xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        {key && (
          <Link to={{ search: withInspector(params, { kind: 'ticket', key }).toString() }} className="hover:underline">
            <TicketKey value={key} className="text-fg-secondary" />
          </Link>
        )}
        <Badge tone={bug ? 'danger' : 'neutral'}>{bug ? 'Bug' : 'Comment'}</Badge>
      </div>
      <MentionText text={body} className="mt-1.5 text-sm text-fg" />
      <AttachmentView attachments={message.attachments} />
    </div>
  )
}

/** "3 replies · 2h ago", opening the thread beside the channel. */
function ThreadLink({ message }: { message: ChatMessage }) {
  const [params] = useSearchParams()
  return (
    <Link
      to={{ search: withInspector(params, { kind: 'thread', messageId: message.id }).toString() }}
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-accent hover:text-accent-strong hover:underline"
    >
      <MessageSquare className="size-3.5" />
      <span className="tabular-nums">
        {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
      </span>
      {message.lastReplyAt && <span className="font-normal text-fg-muted">· {timeAgo(message.lastReplyAt)}</span>}
    </Link>
  )
}

/** One message (or thread reply): avatar, name, time, text, reactions and, for a message with replies, its thread link. */
export function MessageRow({ message, users, showThread = true }: { message: ChatMessage | ThreadReply; users: User[]; showThread?: boolean }) {
  const name = users.find((u) => u.id === message.senderId)?.name ?? 'Unknown person'
  const edited = 'editedAt' in message && message.editedAt
  return (
    <article className="flex gap-3 rounded-lg px-2 py-2 hover:bg-surface-muted/50">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold text-fg">{name}</span>
          <time dateTime={message.createdAt} className="text-xs tabular-nums text-fg-muted">
            {formatWhen(message.createdAt)}
            {edited && ' · edited'}
          </time>
        </p>
        {'commentId' in message && message.commentId ? (
          <CommentCard message={message} />
        ) : (
          <>
            <MentionText text={message.content} />
            <AttachmentView attachments={message.attachments} />
          </>
        )}
        <Reactions reactions={message.reactions} users={users} />
        {showThread && 'threadCount' in message && message.threadCount > 0 && <ThreadLink message={message} />}
      </div>
    </article>
  )
}

/** Pulse rows standing in for messages while they load. */
export function MessageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="h-16 animate-pulse rounded-lg bg-surface-muted" />
      ))}
    </div>
  )
}
