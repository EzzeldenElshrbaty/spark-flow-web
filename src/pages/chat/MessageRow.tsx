import { unnamedKeys } from '@/lib/mentions'
import clsx from 'clsx'
import { ListChecks, MessageSquare } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useEditMessage, useReact } from '@/api/chat'
import type { ChatMessage, ChatTarget, Reaction, ThreadReply, User } from '@/api/types'
import { AttachmentView } from '@/components/AttachmentView'
import { MentionText } from '@/components/MentionText'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { formatWhen, timeAgo } from '@/lib/format'
import { withInspector } from '@/lib/inspector'
import { Composer } from '@/pages/chat/Composer'
import { MessageActions } from '@/pages/chat/MessageActions'
import { TaskEventCard } from '@/pages/chat/TaskEventCard'
import { actionsFor } from '@/pages/chat/messageRights'
import { TicketKey } from '@/pages/projects/ticketPills'

/** Reaction pills: the emoji is the people's own content, the count is ours. Where I can react, a pill toggles mine. */
export function Reactions({ reactions, users, target, meId, canReact }: { reactions: Reaction[]; users: User[]; target: ChatTarget; meId?: string; canReact: boolean }) {
  const react = useReact()
  const shown = reactions.filter((reaction) => reaction.userIds.length > 0)
  if (shown.length === 0) return null
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {shown.map((reaction) => {
        const mine = meId != null && reaction.userIds.includes(meId)
        const who = reaction.userIds.map((id) => users.find((u) => u.id === id)?.name ?? 'Unknown person').join(', ')
        const pill = clsx(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
          mine ? 'border-brand-500/60 bg-accent-soft text-fg' : 'border-line bg-surface-muted text-fg-secondary',
        )
        return (
          <li key={reaction.emoji}>
            {canReact ? (
              <button
                type="button"
                title={who}
                aria-pressed={mine}
                aria-label={`${reaction.emoji} ${reaction.userIds.length}: ${who}`}
                disabled={react.isPending}
                onClick={() => react.mutate({ target, emoji: reaction.emoji })}
                className={clsx(pill, 'hover:border-line-strong')}
              >
                <span>{reaction.emoji}</span>
                <span className="tabular-nums">{reaction.userIds.length}</span>
              </button>
            ) : (
              <span title={who} className={pill}>
                <span>{reaction.emoji}</span>
                <span className="tabular-nums">{reaction.userIds.length}</span>
              </span>
            )}
          </li>
        )
      })}
      {react.error && (
        <li role="alert" className="basis-full text-xs text-red-600 dark:text-red-400">
          {(react.error as Error).message}
        </li>
      )}
    </ul>
  )
}

const CARD = /^(Bug|Comment) on ([A-Z]{2,5}-\d+)(?:: |$)/

/** The card a task comment or bug posts in its project's chat: the task, the kind, the text and its files. */
export function CommentCard({ message }: { message: ChatMessage }) {
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

/** Tasks made from this message that its text doesn't name: one chip each, opening the task beside the channel. */
export function LinkedTasks({ message }: { message: ChatMessage }) {
  const [params] = useSearchParams()
  const keys = unnamedKeys(message.content, message.linkedTicketKeys)
  if (keys.length === 0) return null
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Tasks made from this message">
      {keys.map((key) => (
        <li key={key}>
          <Link
            to={{ search: withInspector(params, { kind: 'ticket', key }).toString() }}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-fg-secondary hover:border-line-strong"
          >
            <ListChecks className="size-3.5" />
            <TicketKey value={key} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** "3 replies · 2h ago", opening the thread beside the channel. */
export function ThreadLink({ message }: { message: ChatMessage }) {
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

/**
 * One message (or thread reply): avatar, name, time, text, reactions and, for a message with replies, its thread link.
 * Where I can post, its ⋯ menu reacts, edits and deletes my own (`actions` adds page items such as Create task).
 */
export function MessageRow({
  message,
  users,
  showThread = true,
  meId,
  canPost = false,
  actions,
}: {
  message: ChatMessage | ThreadReply
  users: User[]
  showThread?: boolean
  meId?: string
  canPost?: boolean
  actions?: (close: () => void) => ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const editMessage = useEditMessage()
  const name = users.find((u) => u.id === message.senderId)?.name ?? 'Unknown person'
  const target: ChatTarget = { kind: 'messageId' in message ? 'reply' : 'message', id: message.id }
  const can = actionsFor(message, meId, canPost)
  const edited = message.editedAt && !message.deletedAt
  let body: ReactNode
  if (message.deletedAt) body = <p className="text-sm italic text-fg-muted">This message was deleted.</p>
  else if (editing)
    body = (
      <div className="mt-1">
        <Composer
          placeholder="Edit message"
          submitLabel="Save"
          pendingLabel="Saving…"
          quiet
          initialText={message.content}
          onCancel={() => {
            editMessage.reset()
            setEditing(false)
          }}
          error={editMessage.error}
          onSubmit={(text) => editMessage.mutateAsync({ target, content: text }, { onSuccess: () => setEditing(false) })}
        />
      </div>
    )
  else if ('commentId' in message && message.commentId) body = <CommentCard message={message} />
  else if ('taskEvent' in message && message.taskEvent) body = <TaskEventCard message={message} users={users} />
  else
    body = (
      <>
        <MentionText text={message.content} />
        <AttachmentView attachments={message.attachments} />
        {'linkedTicketKeys' in message && <LinkedTasks message={message} />}
      </>
    )
  return (
    <article className="group flex gap-3 rounded-lg px-2 py-2 hover:bg-surface-muted/50">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-fg">{name}</span>
            <time dateTime={message.createdAt} className="text-xs tabular-nums text-fg-muted">
              {formatWhen(message.createdAt)}
              {edited && ' · edited'}
            </time>
          </p>
          {!editing && <MessageActions target={target} can={can} onEdit={() => {
            // A new edit starts without the last one's error.
            editMessage.reset()
            setEditing(true)
          }} extra={message.deletedAt ? undefined : actions} />}
        </div>
        {body}
        {!message.deletedAt && <Reactions reactions={message.reactions} users={users} target={target} meId={meId} canReact={can.react} />}
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
