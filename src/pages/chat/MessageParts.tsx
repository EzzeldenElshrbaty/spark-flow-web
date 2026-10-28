import { IconChevronRight, IconListCheck, IconMessage, IconMoodPlus } from '@tabler/icons-react'
import clsx from 'clsx'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useLinkPreview, useOpenDm, useReact } from '@/api/chat'
import type { ChatMessage, ChatTarget, Reaction, User } from '@/api/types'
import { Avatar } from '@/components/sf/Avatar'
import { Tag } from '@/components/sf/Badge'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Popover } from '@/components/sf/Popover'
import { Tooltip } from '@/components/sf/Tooltip'
import { emojiInfo } from '@/lib/emoji'
import { reactorsText } from '@/lib/reactions'
import { EmojiPicker } from '@/pages/chat/EmojiPicker'
import { timeAgo } from '@/lib/format'
import { withInspector } from '@/lib/inspector'
import { parseBody } from '@/lib/messageBody'
import { unnamedKeys } from '@/lib/mentions'
import { paths } from '@/lib/paths'
import { MessageBody, TaskChip, type BodyContext } from '@/pages/chat/MessageBody'
import { MessageFiles } from '@/pages/chat/MessageFiles'

const PRESENCE = { active: 'Active', away: 'Away', offline: 'Offline' } as const

/** The author's name; it opens their profile card (spec 6.3). Someone no longer here is just the name. */
export function AuthorName({ userId, name, ctx }: { userId: string; name: string; ctx: BodyContext }) {
  const user = ctx.users.find((u) => u.id === userId)
  if (!user) return <span className="sf-body-strong truncate text-sf-text">{name}</span>
  return (
    <Popover
      label={user.name}
      trigger={(props) => (
        <button type="button" {...props} className="sf-focus sf-body-strong min-w-0 truncate rounded-sf-sm text-start text-sf-text hover:underline">
          {user.name}
        </button>
      )}
    >
      {(close) => <ProfileCard user={user} ctx={ctx} close={close} />}
    </Popover>
  )
}

/** Who someone is: face and presence, name, title, e-mail, and a way to message them. */
function ProfileCard({ user, ctx, close }: { user: User; ctx: BodyContext; close: () => void }) {
  const openDm = useOpenDm()
  const navigate = useNavigate()
  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <Avatar id={user.id} name={user.name} size="xl" presence={user.presence} decorative />
        <div className="min-w-0">
          <p className="sf-heading truncate text-sf-text">{user.name}</p>
          <p className="sf-small truncate text-sf-text-secondary">{user.title || '—'}</p>
          <p className="sf-meta mt-1 flex items-center gap-1 text-sf-text-muted">
            <span aria-hidden className={clsx('size-2 rounded-sf-full', user.presence === 'active' ? 'bg-sf-presence-active' : 'bg-sf-ink-400')} />
            {PRESENCE[user.presence]}
          </p>
        </div>
      </div>
      <a href={`mailto:${user.email}`} className="sf-focus sf-small mt-3 block truncate rounded-sf-sm text-sf-accent hover:underline">
        {user.email}
      </a>
      <div className="mt-3">
        <Button
          icon={IconMessage}
          disabled={openDm.isPending}
          onClick={() =>
            openDm.mutate(
              { workspaceId: ctx.workspaceId, userIds: [user.id] },
              {
                onSuccess: (channel) => {
                  close()
                  navigate(paths.channel(ctx.ws, channel.id))
                },
              },
            )
          }
        >
          {openDm.isPending ? 'Opening…' : 'Message'}
        </Button>
        {openDm.error && <p className="sf-small mt-2 text-sf-error">{(openDm.error as Error).message}</p>}
      </div>
    </div>
  )
}

/**
 * Reaction pills (spec 6.6): the emoji is the people's own, the count is ours; mine is outlined in accent. The tooltip
 * shows the emoji large, who reacted and its alias. While the row is hovered (or has focus) an add chip opens the
 * emoji picker.
 */
export function Reactions({ reactions, users, target, meId, canReact }: { reactions: Reaction[]; users: User[]; target: ChatTarget; meId?: string; canReact: boolean }) {
  const react = useReact(meId)
  const shown = reactions.filter((reaction) => reaction.userIds.length > 0)
  if (shown.length === 0) return null
  return (
    <ul className="mt-1 flex flex-wrap gap-1" aria-label="Reactions">
      {shown.map((reaction) => {
        const mine = meId != null && reaction.userIds.includes(meId)
        const who = reactorsText(reaction.userIds, meId, (id) => users.find((u) => u.id === id)?.name ?? 'Unknown person')
        const alias = emojiInfo(reaction.emoji)?.aliases[0]
        const tip = (
          <span className="flex items-center gap-2">
            <span className="sf-emoji text-[28px]/none">{reaction.emoji}</span>
            {who}
          </span>
        )
        const pill = clsx(
          'inline-flex h-6 items-center gap-1 rounded-sf-full border px-2 font-sf text-[12px]/[16px] tabular-nums',
          mine ? 'border-sf-accent bg-sf-surface-mention font-semibold text-sf-accent' : 'border-sf-line bg-sf-surface font-medium text-sf-text-secondary',
        )
        const content = (
          <>
            <span className="sf-emoji text-[14px]/none">{reaction.emoji}</span>
            {reaction.userIds.length}
          </>
        )
        return (
          <li key={reaction.emoji}>
            {canReact ? (
              <Tooltip label={tip} sub={alias && `:${alias}:`}>
              <button
                type="button"
                aria-pressed={mine}
                aria-label={`${reaction.emoji} ${reaction.userIds.length}: ${who}`}
                disabled={react.isPending}
                onClick={() => react.mutate({ target, emoji: reaction.emoji })}
                className={clsx('sf-focus', pill, !mine && 'hover:border-sf-line-strong')}
              >
                {content}
              </button>
              </Tooltip>
            ) : (
              <span title={who} aria-label={`${reaction.emoji} ${reaction.userIds.length}: ${who}`} className={pill}>
                {content}
              </span>
            )}
          </li>
        )
      })}
      {canReact && (
        <li className="hidden group-focus-within:block group-hover:block">
          <Popover
            label="Add reaction"
            className="w-[352px] max-w-[calc(100vw-16px)] overflow-hidden"
            trigger={(props) => (
              <button
                type="button"
                {...props}
                aria-label="Add reaction"
                className="sf-focus inline-flex h-6 w-8 items-center justify-center rounded-sf-full border border-sf-line bg-sf-surface text-sf-text-secondary hover:border-sf-line-strong"
              >
                <Icon icon={IconMoodPlus} size={16} />
              </button>
            )}
          >
            {(close) => (
              <EmojiPicker
                onPick={(emoji) => {
                  close()
                  // Picking one I already gave isn't a toggle off: the picker only adds.
                  if (!reactions.some((r) => r.emoji === emoji && meId && r.userIds.includes(meId))) react.mutate({ target, emoji })
                }}
              />
            )}
          </Popover>
        </li>
      )}
      {react.error && (
        <li role="alert" className="sf-small basis-full text-sf-error">
          {(react.error as Error).message}
        </li>
      )}
    </ul>
  )
}

/** The thread summary (spec 6.7): who replied, "3 replies", when the last came; hovering says View thread. */
export function ThreadSummary({ message, users }: { message: ChatMessage; users: User[] }) {
  const [params] = useSearchParams()
  const count = `${message.threadCount} ${message.threadCount === 1 ? 'reply' : 'replies'}`
  const last = message.lastReplyAt ? `Last reply ${timeAgo(message.lastReplyAt)}` : ''
  const faces = (message.replyUserIds ?? []).slice(0, 3).map((id) => ({ id, name: users.find((u) => u.id === id)?.name ?? 'Unknown person' }))
  return (
    <Link
      to={{ search: withInspector(params, { kind: 'thread', messageId: message.id }).toString() }}
      className="group/thread sf-focus -ms-1 mt-1 inline-flex h-8 min-w-[min(420px,100%)] items-center gap-2 rounded-sf-md border border-transparent ps-1 pe-3 hover:border-sf-line hover:bg-sf-surface-raised"
    >
      {faces.length > 0 && (
        <span className="inline-flex items-center gap-0.5">
          {faces.map((f) => (
            <Avatar key={f.id} id={f.id} name={f.name} size="sm" decorative />
          ))}
        </span>
      )}
      <span className="font-sf text-[13px]/[18px] font-semibold text-sf-accent tabular-nums">{count}</span>
      {last && (
        <span className="font-sf text-[13px]/[18px] text-sf-text-muted group-hover/thread:hidden">
          <span className="sr-only">,</span> {last}
        </span>
      )}
      <span className="ms-auto hidden items-center gap-0.5 font-sf text-[13px]/[18px] text-sf-text-secondary group-hover/thread:inline-flex">
        View thread
        <Icon icon={IconChevronRight} size={16} flip />
      </span>
    </Link>
  )
}

/** Tasks made from this message that its text doesn't name: one chip each (live, when I can see the task). */
export function LinkedTasks({ message, ctx }: { message: ChatMessage; ctx: BodyContext }) {
  const [params] = useSearchParams()
  const keys = unnamedKeys(message.content, message.linkedTicketKeys)
  if (keys.length === 0) return null
  return (
    <ul className="mt-1 flex flex-wrap items-center gap-1" aria-label="Tasks made from this message">
      <li aria-hidden className="text-sf-text-muted">
        <Icon icon={IconListCheck} size={16} />
      </li>
      {keys.map((key) => {
        const task = ctx.tasks.get(key)
        return (
          <li key={key}>
            {task ? (
              <TaskChip task={task} />
            ) : (
              <Link
                to={{ search: withInspector(params, { kind: 'ticket', key }).toString() }}
                className="sf-focus rounded-sf-sm border border-sf-line bg-sf-surface-sunken px-1 font-mono text-[12px]/[18px] font-medium text-sf-text"
              >
                <bdi dir="ltr">{key}</bdi>
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}

const CARD = /^(Bug|Comment) on ([A-Z]{2,5}-\d+)(?:: |$)/

/** The card a task comment or bug posts in its project's chat: the task, the kind, the text and its files. */
export function CommentCard({ message, ctx, link }: { message: ChatMessage; ctx: BodyContext; link?: string }) {
  const [params] = useSearchParams()
  const match = CARD.exec(message.content)
  const bug = match?.[1] === 'Bug'
  const key = match?.[2] ?? message.linkedTicketKeys[0]
  const task = key ? ctx.tasks.get(key) : undefined
  const text = match ? message.content.slice(match[0].length) : message.content
  return (
    <div className="mt-1 max-w-[520px] rounded-sf-lg border border-sf-line bg-sf-surface p-3">
      <div className="flex items-center gap-2">
        {task ? (
          <TaskChip task={task} />
        ) : (
          key && (
            <Link to={{ search: withInspector(params, { kind: 'ticket', key }).toString() }} className="sf-focus rounded-sf-sm font-mono text-[12px]/[18px] font-medium text-sf-text-secondary hover:underline">
              <bdi dir="ltr">{key}</bdi>
            </Link>
          )
        )}
        <Tag tone={bug ? 'accent' : 'default'}>{bug ? 'Bug' : 'Comment'}</Tag>
        {task && <span className="sf-small min-w-0 truncate text-sf-text-secondary">{task.title}</span>}
      </div>
      {text.trim() && <div className="mt-2"><MessageBody body={parseBody(text)} ctx={ctx} /></div>}
      <MessageFiles attachments={message.attachments} link={link} />
    </div>
  )
}

/** A link's preview (spec 6.3 URL unfurl): site, title, description and image, for allowed domains only. */
export function LinkPreviewCard({ url }: { url: string }) {
  const preview = useLinkPreview(url)
  const p = preview.data
  if (!p) return null
  const image = p.image?.startsWith('https://') ? p.image : null
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      className="sf-focus mt-1 grid max-w-[520px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sf-lg border border-sf-line bg-sf-surface p-3 hover:bg-sf-surface-hover"
    >
      <span className="min-w-0">
        <span className="sf-meta block truncate text-sf-text-muted">{p.siteName}</span>
        <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-accent">{p.title}</span>
        {p.description && <span className="sf-small line-clamp-2 text-sf-text-secondary">{p.description}</span>}
      </span>
      {image && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-16 rounded-sf-md border border-sf-line object-cover" />}
    </a>
  )
}
