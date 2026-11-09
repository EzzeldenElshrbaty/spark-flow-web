import { IconArrowUpRight, IconBellOff, IconDotsVertical, IconLink } from '@tabler/icons-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Avatar } from '@/components/Avatar'
import { Tag } from '@/components/sf/Badge'
import { Button, IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { MuteThreadItem } from '@/pages/chat/MessageActions'
import { useCopyLink } from '@/pages/chat/useCopyLink'

/** "Nour", "Nour and Mariam", "Nour, Mariam and Youssef". */
const names = (people: { name: string }[]) =>
  people.length < 2 ? (people[0]?.name ?? '') : `${people.slice(0, -1).map((p) => p.name).join(', ')} and ${people.at(-1)!.name}`

/**
 * One thread in the Threads view (spec 6.12): a header (where it is, who is in it, how many replies are new,
 * Unfollow, ⋯ with View in channel and Copy link), the parent, "Show N more replies", the latest replies and the reply
 * box. Unfollowed, it folds to one line with Follow again and stays where it is until the view is left.
 */
export function ThreadCardView({
  place,
  participants,
  newCount,
  hiddenCount,
  loadingMore,
  onShowMore,
  unfollowed,
  muted,
  onToggleMute,
  onUnfollow,
  onFollow,
  followError,
  channelHref,
  link,
  parent,
  replies,
  replyBox,
}: {
  /** `#backend`, or a DM's people. */
  place: string
  /** Newest repliers first, the parent's author last; at most 5. */
  participants: { id: string; name: string }[]
  /** Replies that were unread when the view opened (kept while it stays open). */
  newCount: number
  /** Replies not shown yet. */
  hiddenCount: number
  loadingMore: boolean
  onShowMore: () => void
  unfollowed: boolean
  /** I muted it (slice AA): a bell-off "Muted" tag, and Unmute thread in ⋯. */
  muted: boolean
  onToggleMute: () => void
  onUnfollow: () => void
  onFollow: () => void
  followError: string | null
  channelHref: string
  link: string
  parent: ReactNode
  replies: ReactNode
  replyBox: ReactNode
}) {
  const titleId = useId()
  const navigate = useNavigate()
  const { copy, note } = useCopyLink(link)
  // Folding and unfolding swaps the button I pressed for the other one: the keyboard follows it (not on first show).
  const followButton = useRef<HTMLButtonElement>(null)
  const was = useRef(unfollowed)
  useEffect(() => {
    if (was.current === unfollowed) return
    was.current = unfollowed
    followButton.current?.focus()
  }, [unfollowed])
  return (
    <article aria-labelledby={titleId} className="rounded-sf-lg border border-sf-line bg-sf-surface">
      <header className="flex min-w-0 items-center gap-2 border-b border-sf-line py-2 ps-4 pe-2">
        <h2 id={titleId} className="sf-body-strong min-w-0 truncate text-sf-text">
          {place}
        </h2>
        <span role="img" aria-label={names(participants)} className="flex flex-none -space-x-1">
          {participants.map((p) => (
            <Avatar key={p.id} id={p.id} name={p.name} size={20} decorative />
          ))}
        </span>
        {newCount > 0 && !unfollowed && <Tag tone="accent">{newCount} new</Tag>}
        {muted && !unfollowed && (
          <Tag>
            <Icon icon={IconBellOff} size={16} /> Muted
          </Tag>
        )}
        <span className="flex-1" />
        {!unfollowed && (
          <Button ref={followButton} size="sm" touch onClick={onUnfollow}>
            Unfollow
          </Button>
        )}
        <div className="relative flex-none">
          <Menu label="Thread actions" trigger={(props) => <IconButton label="Thread actions" icon={IconDotsVertical} size="sm" className="relative max-md:after:absolute max-md:after:-inset-2" {...props} />}>
            <MenuItem icon={IconArrowUpRight} onSelect={() => navigate(channelHref)}>
              View in channel
            </MenuItem>
            <MenuItem icon={IconLink} onSelect={() => void copy()}>
              Copy link
            </MenuItem>
            {!unfollowed && <MuteThreadItem muted={muted} onToggle={onToggleMute} />}
          </Menu>
          {note}
        </div>
      </header>
      {followError && (
        <p role="alert" className="sf-small px-4 pt-2 text-sf-error">
          {followError}
        </p>
      )}
      {unfollowed ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="sf-small m-0 text-sf-text-secondary">You won’t be told about new replies.</p>
          <Button ref={followButton} size="sm" touch onClick={onFollow}>
            Follow again
          </Button>
        </div>
      ) : (
        <div className="px-1 pt-1 pb-3">
          {parent}
          {hiddenCount > 0 && (
            <div className="ps-[calc(var(--size-avatar)+1.75rem)] pe-3">
              <button
                type="button"
                disabled={loadingMore}
                onClick={onShowMore}
                className="sf-focus sf-small relative cursor-pointer rounded-sf-sm py-1 font-medium text-sf-accent hover:underline disabled:cursor-default disabled:text-sf-text-muted max-md:after:absolute max-md:after:-inset-y-2.5 max-md:after:inset-x-0"
              >
                {loadingMore ? 'Loading replies…' : `Show ${hiddenCount} more ${hiddenCount === 1 ? 'reply' : 'replies'}`}
              </button>
            </div>
          )}
          {replies}
          <div className="mt-2 px-3">{replyBox}</div>
        </div>
      )}
    </article>
  )
}
