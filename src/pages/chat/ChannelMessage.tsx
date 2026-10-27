import { IconTrash } from '@tabler/icons-react'
import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import { useEditMessage } from '@/api/chat'
import type { ChatMessage, ChatTarget, SystemEvent, User } from '@/api/types'
import { AttachmentView } from '@/components/AttachmentView'
import { Avatar } from '@/components/sf/Avatar'
import { Icon } from '@/components/sf/Icon'
import { formatDate, formatTime } from '@/lib/format'
import { Composer } from '@/pages/chat/Composer'
import { firstTask, MessageBody, TaskUnfurl, type BodyContext } from '@/pages/chat/MessageBody'
import { MessageActions } from '@/pages/chat/MessageActions'
import { CommentCard, LinkedTasks, Reactions, ThreadLink } from '@/pages/chat/MessageRow'
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
const mentionsMe = (message: ChatMessage, meId?: string) => message.mentions.some((m) => m.kind === 'all' || (m.kind === 'user' && m.id === meId))

/**
 * One message in a channel (spec 6.3): 36px avatar, author and time, then the body as rich text with mention pills,
 * task chips and the first task's unfurl, files, reactions and the thread summary. A continuation has no avatar
 * or name (the time shows in the gutter on hover); screen readers still hear author, time, body, reactions in order.
 * States: mention of me, selected, edited, deleted (kept only when it has replies) and system messages.
 */
export function ChannelMessage({
  message,
  users,
  ctx,
  meId,
  canPost,
  continuation,
  selected = null,
  actions,
}: {
  message: ChatMessage
  users: User[]
  ctx: BodyContext
  meId?: string
  canPost: boolean
  continuation: boolean
  selected?: Selection
  actions?: (close: () => void) => ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const editMessage = useEditMessage()
  const author = users.find((u) => u.id === message.senderId)
  const name = author?.name ?? 'Unknown person'
  const target: ChatTarget = { kind: 'message', id: message.id }
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
  else if (message.system) body = <p className="sf-small leading-[22px] text-sf-text-secondary">{systemText(message.system)}</p>
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
  else if (message.commentId) body = <CommentCard message={message} />
  else if (message.taskEvent) body = <TaskEventCard message={message} users={users} />
  else {
    const unfurl = firstTask(message.body, ctx.tasks)
    body = (
      <>
        <MessageBody body={message.body} ctx={ctx} after={message.editedAt && <span className="sf-meta text-sf-text-muted">(edited)</span>} />
        <AttachmentView attachments={message.attachments} />
        <LinkedTasks message={message} />
        {unfurl && <TaskUnfurl task={unfurl} users={users} />}
      </>
    )
  }

  const background =
    selected === 'on' ? 'bg-sf-surface-selected' : mentionsMe(message, meId) && !message.deletedAt ? 'bg-sf-surface-mention' : 'hover:bg-sf-surface-hover'
  return (
    <article
      className={clsx(
        'sf group relative grid grid-cols-[var(--size-avatar)_minmax(0,1fr)] gap-x-3 px-4 transition-colors duration-[600ms] ease-sf md:px-6',
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
          <span className="sf-body-strong truncate text-sf-text">{name}</span>
          {time}
        </p>
        {body}
        {!message.deletedAt && !message.system && (
          <Reactions reactions={message.reactions} users={users} target={target} meId={meId} canReact={can.react} />
        )}
        {message.threadCount > 0 && <ThreadLink message={message} />}
      </div>
      {!editing && !message.system && (
        // The toolbar comes in Phase 2; until then the ⋯ menu shows on hover and on keyboard focus.
        <div className="absolute end-4 top-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 md:end-6">
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
