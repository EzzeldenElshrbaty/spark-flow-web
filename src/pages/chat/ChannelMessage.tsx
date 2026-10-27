import { IconTrash } from '@tabler/icons-react'
import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import { useEditMessage } from '@/api/chat'
import type { ChatMessage, ChatTarget, SystemEvent, ThreadReply, User } from '@/api/types'
import { Avatar } from '@/components/sf/Avatar'
import { Icon } from '@/components/sf/Icon'
import { formatDate, formatTime } from '@/lib/format'
import { firstPreviewable } from '@/lib/linkPreview'
import { Composer } from '@/pages/chat/Composer'
import { firstTask, MessageBody, TaskUnfurl, type BodyContext } from '@/pages/chat/MessageBody'
import { MessageActions } from '@/pages/chat/MessageActions'
import { MessageFiles } from '@/pages/chat/MessageFiles'
import { AuthorName, CommentCard, LinkedTasks, LinkPreviewCard, Reactions, ThreadSummary } from '@/pages/chat/MessageParts'
import { TaskEventCard } from '@/pages/chat/TaskEventCard'
import { actionsFor } from '@/pages/chat/messageRights'

/** What the channel says about a change, after the name of whoever made it. */
export function systemText(event: SystemEvent): string {
  switch (event.kind) {
    case 'joined':
      return 'joined the channel.'
    case 'left':
      return 'left the channel.'
    case 'renamed':
      return `renamed the channel to #${event.to} (was #${event.from}).`
    case 'topic':
      return event.to ? `changed the topic to “${event.to}”.` : 'cleared the topic.'
  }
}

/** Selected while its thread is open or right after a jump; `fading` lets the colour go over 600ms (spec 6.3). */
export type Selection = 'on' | 'fading' | null

/** Whether the message mentions me, or everyone. */
const mentionsMe = (message: ChatMessage | ThreadReply, meId?: string) => message.mentions.some((m) => m.kind === 'all' || (m.kind === 'user' && m.id === meId))

/**
 * One message or thread reply (spec 6.3): 36px avatar, author (opens their profile card) and time, then the body as
 * rich text with mention pills, task chips, the first task's and the first allowed link's cards, files, reactions
 * and the thread summary. A continuation has no avatar or name (the time shows in the gutter on hover); screen
 * readers still hear author, time, body, reactions in order. States: mention of me, selected, edited, deleted (kept
 * only when it has replies) and system messages. `compact` is for the narrow thread panel.
 */
export function ChannelMessage({
  message,
  users,
  ctx,
  meId,
  canPost,
  continuation,
  selected = null,
  showThread = true,
  compact = false,
  actions,
}: {
  message: ChatMessage | ThreadReply
  users: User[]
  ctx: BodyContext
  meId?: string
  canPost: boolean
  continuation: boolean
  selected?: Selection
  /** The thread summary; off for the root message at the top of its own thread. */
  showThread?: boolean
  compact?: boolean
  actions?: (close: () => void) => ReactNode
}) {
  const reply = 'messageId' in message
  const root = reply ? null : message
  const [editing, setEditing] = useState(false)
  const editMessage = useEditMessage()
  const author = users.find((u) => u.id === message.senderId)
  const name = author?.name ?? 'Unknown person'
  const target: ChatTarget = { kind: reply ? 'reply' : 'message', id: message.id }
  const can = actionsFor(message, meId, canPost)
  const full = `${formatDate(message.createdAt)}, ${formatTime(message.createdAt)}`
  const time = (
    <time dateTime={message.createdAt} title={full} className="sf-meta whitespace-nowrap text-sf-text-muted tabular-nums">
      {formatTime(message.createdAt)}
    </time>
  )

  let body: ReactNode
  if (message.deletedAt)
    body = (
      <p className="sf-body flex items-center gap-1 text-sf-text-muted">
        <Icon icon={IconTrash} size={16} />
        This message was deleted.
      </p>
    )
  else if (root?.system) body = <p className="sf-small leading-[22px] text-sf-text-secondary">{systemText(root.system)}</p>
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
  else if (root?.commentId) body = <CommentCard message={root} ctx={ctx} />
  else if (root?.taskEvent) body = <TaskEventCard message={root} users={users} ctx={ctx} />
  else {
    const unfurl = firstTask(message.body, ctx.tasks)
    const link = firstPreviewable(message.body)
    body = (
      <>
        <MessageBody body={message.body} ctx={ctx} after={message.editedAt && <span className="sf-meta text-sf-text-muted">(edited)</span>} />
        <MessageFiles attachments={message.attachments} />
        {root && <LinkedTasks message={root} ctx={ctx} />}
        {unfurl && <TaskUnfurl task={unfurl} users={users} />}
        {link && <LinkPreviewCard url={link} />}
      </>
    )
  }

  const background =
    selected === 'on' ? 'bg-sf-surface-selected' : mentionsMe(message, meId) && !message.deletedAt ? 'bg-sf-surface-mention' : 'hover:bg-sf-surface-hover'
  return (
    <article
      className={clsx(
        'sf group relative grid grid-cols-[var(--size-avatar)_minmax(0,1fr)] gap-x-3 transition-colors duration-[600ms] ease-sf',
        compact ? 'px-3' : 'px-4 md:px-6',
        continuation ? 'py-0.5' : 'py-2',
        background,
      )}
    >
      {continuation ? (
        <span aria-hidden className="invisible pt-[3px] text-end group-hover:visible">
          {time}
        </span>
      ) : (
        <Avatar id={message.senderId} name={name} decorative />
      )}
      <div className="min-w-0">
        <p className={clsx('flex min-w-0 items-baseline gap-2', continuation && 'sr-only')}>
          <AuthorName userId={message.senderId} name={name} ctx={ctx} />
          {time}
        </p>
        {body}
        {!message.deletedAt && !root?.system && (
          <Reactions reactions={message.reactions} users={users} target={target} meId={meId} canReact={can.react} />
        )}
        {root && showThread && root.threadCount > 0 && <ThreadSummary message={root} users={users} />}
      </div>
      {!editing && !root?.system && (
        // The toolbar comes in Phase 2; until then the ⋯ menu shows on hover and on keyboard focus.
        <div className={clsx('absolute top-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100', compact ? 'end-3' : 'end-4 md:end-6')}>
          <MessageActions
            target={target}
            can={can}
            onEdit={() => {
              editMessage.reset()
              setEditing(true)
            }}
            extra={message.deletedAt ? undefined : actions}
          />
        </div>
      )}
    </article>
  )
}
