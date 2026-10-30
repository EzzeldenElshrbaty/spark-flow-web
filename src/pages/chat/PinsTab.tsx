import { IconPinFilled } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { usePins, useSetPinned } from '@/api/pins'
import type { Channel, PinnedMessage, User } from '@/api/types'
import { Avatar } from '@/components/sf/Avatar'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { senderName } from '@/lib/flowbot'
import { formatWhen } from '@/lib/format'
import { paths } from '@/lib/paths'
import { MessageBody, type BodyContext } from '@/pages/chat/MessageBody'
import { useBodyContext, useProjectKeys } from '@/pages/chat/useBodyContext'

/**
 * The channel's Pins tab (spec 6.1): every pinned message, newest pin first, with its author, its text, who pinned it
 * and when; View message opens it in the channel, and Unpin (where I may post) takes it off.
 */
export function PinsTab({ pins, ctx, canUnpin, onUnpin }: { pins: PinnedMessage[]; ctx: BodyContext; canUnpin: boolean; onUnpin: (messageId: string) => Promise<unknown> }) {
  const [error, setError] = useState<string | null>(null)
  if (pins.length === 0) return <p className="sf-ui px-6 py-8 text-sf-text-muted">Nothing is pinned yet. Pin a message from its ⋯ menu, or press P on it.</p>
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {error && <p className="sf-small px-6 pt-3 text-sf-error">{error}</p>}
      <ul className="m-0 list-none p-0">
        {pins.map(({ message, pinnedBy, pinnedAt }) => {
          const author = senderName(message.senderId, ctx.users)
          return (
            <li key={message.id}>
              <article aria-label={author} className="grid grid-cols-[var(--size-avatar)_minmax(0,1fr)] gap-x-3 border-b border-sf-line px-4 py-3 sm:px-6">
                <Avatar id={message.senderId} name={author} decorative />
                <div className="min-w-0">
                  <p className="m-0 flex items-baseline gap-2">
                    <span className="sf-body-strong text-sf-text">{author}</span>
                    <time dateTime={message.createdAt} className="sf-meta text-sf-text-muted tabular-nums">
                      {formatWhen(message.createdAt)}
                    </time>
                  </p>
                  <div className="line-clamp-4">
                    <MessageBody body={message.body} ctx={ctx} />
                  </div>
                  <p className="sf-meta mt-1 flex flex-wrap items-center gap-x-1 text-sf-text-secondary">
                    <Icon icon={IconPinFilled} size={14} />
                    Pinned by {senderName(pinnedBy, ctx.users)} · {formatWhen(pinnedAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      to={paths.message(ctx.ws, message.channelId, message.id)}
                      className="sf-focus sf-small inline-flex h-7 items-center rounded-sf-md border border-sf-line px-3 font-medium text-sf-text hover:bg-sf-surface-hover max-md:h-11"
                    >
                      View message
                    </Link>
                    {canUnpin && (
                      <Button size="sm" touch onClick={() => onUnpin(message.id).then(() => setError(null), (e: Error) => setError(e.message || "Couldn't unpin it. Try again."))}>
                        Unpin
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The Pins tab as the channel shows it: its pins, live, with Unpin where I may post. */
export function ChannelPins({ channel, users, canPost }: { channel: Channel; users: User[]; canPost: boolean }) {
  const { workspace } = useCurrentWorkspace()
  const pins = usePins(channel.id)
  const setPinned = useSetPinned()
  const projectKeys = useProjectKeys(workspace?.id)
  const scope = useMemo(() => ({ users, projectKeys, ws: workspace?.slug ?? '', workspaceId: workspace?.id ?? '' }), [users, projectKeys, workspace])
  const ctx = useBodyContext(useMemo(() => (pins.data ?? []).map((p) => p.message.body), [pins.data]), scope)
  if (pins.isError)
    return (
      <p className="sf-ui px-6 py-8 text-sf-error">
        The pins couldn’t be loaded.{' '}
        <button type="button" className="sf-focus font-medium underline" onClick={() => void pins.refetch()}>
          Try again
        </button>
      </p>
    )
  if (!pins.data) return <div aria-hidden className="mx-6 my-6 h-24 animate-pulse rounded-sf-lg bg-sf-surface-hover" />
  return <PinsTab pins={pins.data} ctx={ctx} canUnpin={canPost} onUnpin={(messageId) => setPinned.mutateAsync({ messageId, pinned: false })} />
}
