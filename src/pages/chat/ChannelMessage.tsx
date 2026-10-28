import { IconAlertCircle, IconTrash } from '@tabler/icons-react'
import clsx from 'clsx'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useEditMessage } from '@/api/chat'
import { bodyText } from '@/lib/messageBody'
import type { ChatMessage, ChatTarget, SystemEvent, ThreadReply, User } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Avatar } from '@/components/sf/Avatar'
import { Icon } from '@/components/sf/Icon'
import { formatDate, formatTime } from '@/lib/format'
import { firstPreviewable } from '@/lib/linkPreview'
import { parseInspector, withInspector } from '@/lib/inspector'
import { paths } from '@/lib/paths'
import { firstTask, MessageBody, TaskUnfurl, type BodyContext } from '@/pages/chat/MessageBody'
import { ROW_FOCUS } from '@/pages/chat/MessageActions'
import { MessageFiles } from '@/pages/chat/MessageFiles'
import { MessageToolbar, ROW_HEADER } from '@/pages/chat/MessageToolbar'
import { AuthorName, CommentCard, LinkedTasks, LinkPreviewCard, Reactions, ThreadSummary } from '@/pages/chat/MessageParts'
import { TaskEventCard } from '@/pages/chat/TaskEventCard'
import { useEditing } from '@/pages/chat/editingStore'
import { actionsFor, deleteNeedsConfirm } from '@/pages/chat/messageRights'
import { useComposerDirectory } from '@/pages/chat/useComposerDirectory'
import { replyState } from '@/pages/chat/useReplyFocus'

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

/** How long "Link copied" and "Marked unread" stay; a failure stays until the next one. */
const NOTE_MS = 2000

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
  sendState,
  sendError,
  onRetry,
  onDiscard,
  onMarkUnread,
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
  /** More ⋯ menu items from the page (Create task), as sf `MenuItem`s. */
  actions?: ReactNode
  /** Mine and not confirmed yet (spec 6.2): on its way, or refused with Retry and Delete. */
  sendState?: 'sending' | 'failed'
  sendError?: string
  onRetry?: () => void
  onDiscard?: () => void
  /** Mark unread (U) from this message, where the page offers it (the channel's list). */
  onMarkUnread?: () => Promise<unknown>
}) {
  const reply = 'messageId' in message
  const root = reply ? null : message
  const editing = useEditing((s) => s.id === message.id)
  const startEditing = () => useEditing.getState().start(message.id)
  const stopEditing = () => useEditing.getState().stop()
  const row = useRef<HTMLElement>(null)
  const wasEditing = useRef(false)
  // The edit box took focus with it: give focus back to where the edit started, else to this message's toolbar
  // (spec 10). Not when focus is already somewhere, or another edit has begun.
  useEffect(() => {
    if (editing) wasEditing.current = true
    if (editing || !wasEditing.current) return
    wasEditing.current = false
    const { id, from } = useEditing.getState()
    if (id !== null || (document.activeElement && document.activeElement !== document.body)) return
    ;(from?.isConnected ? from : row.current?.querySelector<HTMLElement>(`[${ROW_FOCUS}]`))?.focus()
  }, [editing])
  const author = users.find((u) => u.id === message.senderId)
  const name = author?.name ?? 'Unknown person'
  const target: ChatTarget = { kind: reply ? 'reply' : 'message', id: message.id }
  // Where a link to this message (or to a reply's thread) goes; Copy link to file gives it.
  const permalink = new URL(
    reply ? `${paths.channel(ctx.ws, message.channelId)}?thread=${encodeURIComponent(message.messageId)}` : paths.message(ctx.ws, message.channelId, message.id),
    window.location.origin,
  ).href
  const admin = ctx.users.find((u) => u.id === meId)?.role === 'admin'
  const can = actionsFor(message, meId, canPost, admin)
  // What U or L did, said under the message (no toasts outside Undo) and read out through the app's live region.
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const say = (text: string, error = false) => {
    setNote({ text, error })
    announce(text)
  }
  useEffect(() => {
    if (!note || note.error) return
    const timer = setTimeout(() => setNote(null), NOTE_MS)
    return () => clearTimeout(timer)
  }, [note])
  // Someone else's message, there and settled: my own never count as unread.
  const markUnread =
    onMarkUnread && !reply && message.senderId !== meId && !message.deletedAt && !sendState && !root?.system
      ? () => onMarkUnread().then(() => say('Marked unread'), () => say("Couldn't mark it unread. Try again.", true))
      : undefined
  // Copied while the key press still counts as mine; no clipboard (an insecure page) fails the same way as a refusal.
  const copy = (text: string, done: string, failed: string) =>
    new Promise<void>((resolve) => resolve(navigator.clipboard.writeText(text))).then(() => say(done), () => say(failed, true))
  const copyLink = () => copy(permalink, 'Link copied', "Couldn't copy the link")
  const copyText = () => copy(bodyText(message.body), 'Text copied', "Couldn't copy the text")
  // Reply in thread (T, spec 6.4): a top-level message outside its own thread, where I may post; the thread opens to
  // its reply box. Asked again while that thread is open, it doesn't add a step to the history.
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const openThread =
    root && showThread && !root.deletedAt && canPost
      ? () => {
          const open = parseInspector(params)
          navigate({ search: withInspector(params, { kind: 'thread', messageId: root.id }).toString() }, { state: replyState, replace: open?.kind === 'thread' && open.messageId === root.id })
        }
      : undefined
  const full = `${formatDate(message.createdAt)}, ${formatTime(message.createdAt)}`
  const time = (
    <time dateTime={message.createdAt} title={full} className="sf-meta whitespace-nowrap text-sf-text-muted tabular-nums">
      {sendState === 'sending' ? 'Sending…' : formatTime(message.createdAt)}
    </time>
  )

  let body: ReactNode
  if (editing) body = <EditBox message={message} target={target} ctx={ctx} onDone={stopEditing} />
  else if (message.deletedAt)
    body = (
      <p className="sf-body flex items-center gap-1 text-sf-text-muted">
        <Icon icon={IconTrash} size={16} />
        This message was deleted.
      </p>
    )
  else if (root?.system) body = <p className="sf-small leading-[22px] text-sf-text-secondary">{systemText(root.system)}</p>
  else if (root?.commentId) body = <CommentCard message={root} ctx={ctx} link={permalink} />
  else if (root?.taskEvent) body = <TaskEventCard message={root} users={users} ctx={ctx} />
  else {
    const unfurl = firstTask(message.body, ctx.tasks)
    const link = firstPreviewable(message.body)
    body = (
      <>
        <MessageBody body={message.body} ctx={ctx} muted={sendState === 'failed'} after={message.editedAt && <span className="sf-meta text-sf-text-muted">(edited)</span>} />
        <MessageFiles attachments={message.attachments} link={permalink} />
        {root && <LinkedTasks message={root} ctx={ctx} />}
        {unfurl && <TaskUnfurl task={unfurl} users={users} />}
        {link && <LinkPreviewCard url={link} />}
      </>
    )
  }

  const background =
    selected === 'on' ? 'bg-sf-surface-selected' : mentionsMe(message, meId) && !message.deletedAt ? 'bg-sf-surface-mention' : 'hover:bg-sf-surface-hover'
  // Muted text on a tinted row steps up to secondary to keep 4.5:1 (spec 10). Set on the row's children: the row is
  // `.sf`, whose token rules sit outside Tailwind's layers and would win.
  const tint = background.startsWith('bg-') && '[--text-muted:var(--text-secondary)]'
  return (
    <article
      ref={row}
      // While focus is in it (its toolbar), as long as I'm not typing somewhere: E edits my message (spec 6.3), U marks
      // it unread from here, L copies its link, T opens its thread to reply (spec 10).
      onKeyDown={(e) => {
        // Keys from this row's portals (the emoji picker, the ⋯ menu on phones) bubble here too, and so do keys from
        // its open ⋯ menu (which picks its own items by their keys): they aren't for the row. A held key acts once.
        if (!e.currentTarget.contains(e.target as Node) || (e.target as HTMLElement).closest('[role="menu"]')) return
        const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')
        if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || typing) return
        const key = e.key.toLowerCase()
        if (key === 'e' && can.edit && !editing && !sendState) {
          e.preventDefault()
          startEditing()
        } else if (key === 'u' && markUnread) {
          e.preventDefault()
          void markUnread()
        } else if (key === 'l' && !message.deletedAt && !sendState) {
          e.preventDefault()
          void copyLink()
        } else if (key === 't' && openThread && !sendState) {
          e.preventDefault()
          openThread()
        }
      }}
      className={clsx(
        'sf group relative grid grid-cols-[var(--size-avatar)_minmax(0,1fr)] gap-x-3 transition-colors duration-[600ms] ease-sf',
        compact ? 'px-3' : 'px-4 md:px-6',
        continuation ? 'py-0.5' : 'py-2',
        background,
      )}
    >
      {continuation ? (
        <span aria-hidden className={clsx('invisible pt-[3px] text-end group-hover:visible', tint)}>
          {time}
        </span>
      ) : (
        <Avatar id={message.senderId} name={name} decorative />
      )}
      <div className={clsx('min-w-0', tint)}>
        <p {...{ [ROW_HEADER]: continuation ? undefined : '' }} className={clsx('flex min-w-0 items-baseline gap-2', continuation && 'sr-only')}>
          {/* A grouped row's name is for screen readers only: text, not a button no one can see focused. */}
          {continuation ? <span>{name}</span> : <AuthorName userId={message.senderId} name={name} ctx={ctx} />}
          {time}
        </p>
        {body}
        {sendState === 'failed' && (
          <p title={sendError} className="sf-meta mt-0.5 flex items-center gap-1 font-medium text-sf-accent">
            <Icon icon={IconAlertCircle} size={16} />
            <span>Not sent.</span>
            <button type="button" onClick={onRetry} className="sf-focus rounded-sf-sm underline">
              Retry
            </button>
            ·
            <button type="button" onClick={onDiscard} className="sf-focus rounded-sf-sm underline">
              Delete
            </button>
          </p>
        )}
        {!sendState && !message.deletedAt && !root?.system && (
          <Reactions reactions={message.reactions} users={users} target={target} meId={meId} canReact={can.react} />
        )}
        {root && showThread && root.threadCount > 0 && <ThreadSummary message={root} users={users} />}
        {note && <p className={clsx('sf-meta mt-0.5', note.error ? 'text-sf-error' : 'text-sf-text-secondary')}>{note.text}</p>}
      </div>
      {!editing && !sendState && !root?.system && (
        <MessageToolbar
          target={target}
          reactions={message.reactions}
          meId={meId}
          can={can}
          confirmDelete={deleteNeedsConfirm(message)}
          onEdit={startEditing}
          onReply={openThread}
          onMarkUnread={markUnread && (() => void markUnread())}
          onCopyLink={message.deletedAt ? undefined : () => void copyLink()}
          onCopyText={message.deletedAt ? undefined : () => void copyText()}
          extra={message.deletedAt ? undefined : actions}
          className={compact ? 'end-3' : 'end-4 md:end-6'}
        />
      )}
    </article>
  )
}

const RichComposer = lazy(() => import('@/pages/chat/composer/RichComposer').then((m) => ({ default: m.RichComposer })))

/**
 * A message's body while I edit it in place (spec 6.3): the rich editor with its text, Cancel and Save; Enter saves,
 * Escape cancels. It closes once the edit is saved; a refusal stays as a sentence under it.
 */
function EditBox({ message, target, ctx, onDone }: { message: ChatMessage | ThreadReply; target: ChatTarget; ctx: BodyContext; onDone: () => void }) {
  const edit = useEditMessage()
  const directory = useComposerDirectory(ctx.workspaceId)
  // The box grows once the editor loads, and as lines are added: keep all of it (Cancel and Save) in view.
  const keepInView = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const observer = new ResizeObserver(() => el.scrollIntoView({ block: 'nearest' }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={keepInView} className="mt-1">
      <Suspense fallback={<MessageBody body={message.body} ctx={ctx} />}>
        <RichComposer
          mode="edit"
          placeholder="Edit message"
          initialBody={message.body}
          directory={directory}
          error={edit.error}
          onCancel={onDone}
          onSend={(body) => edit.mutateAsync({ target, content: bodyText(body), body }).then(onDone)}
        />
      </Suspense>
    </div>
  )
}
