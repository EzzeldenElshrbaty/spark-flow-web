import { IconArchive, IconBell, IconBellOff, IconChecks, IconChevronDown, IconDotsVertical, IconHash, IconInfoCircle, IconLink, IconLock, IconLogout, IconSearch, IconStar, IconStarFilled } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import type { Channel, NotifyLevel } from '@/api/types'
import { Avatar } from '@/components/sf/Avatar'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuHeading, MenuItem, MenuSeparator, Submenu } from '@/components/sf/Menu'
import { usePhone } from '@/components/sf/usePhone'
import type { DetailsTab } from '@/pages/chat/ChannelDetails'
import { NotifyLevelItems, NotifyLevelMenu, type PreferencesLink } from '@/pages/chat/NotifyLevelMenu'

const COPIED_MS = 2000

export type ChannelHeaderProps = {
  channel: Channel
  /** The channel's name without `#`, or the conversation's people. */
  title: string
  members: { id: string; name: string }[]
  /** manage: change details; leave: leave the channel; archive: Admins (spec 6.1). */
  rights: { manage: boolean; leave: boolean; archive: boolean }
  /** Opens Channel details (spec 6.10) on a tab; `editTopic` opens the topic field. */
  onDetails: (tab: DetailsTab, editTopic?: boolean) => void
  onStar: (starred: boolean) => void
  onMute: (muted: boolean) => void
  /** What the channel notifies me about (spec 6.11). */
  onNotifyLevel: (level: NotifyLevel | null) => void
  /** The bell's way to my Preferences and its Do Not Disturb note (spec 6.11). */
  preferences?: PreferencesLink
  onMarkRead: () => void
  onCopyLink: () => Promise<void>
  onLeave: () => void
  onArchive: () => void
  /** Search in this channel (spec 6.1); no button without it (a group conversation). */
  onSearch?: () => void
}

/**
 * The 52px channel header (spec 6.1): name, star, topic, then members, the notifications bell (spec 6.11) and the more
 * menu at the end. A channel's name opens Channel details for everyone who can read it. It never wraps: the topic
 * truncates first, then the members button goes (Members is in Channel details too). On phones the topic moves into
 * the more menu, with channel search before the menu (spec 6.1). Call comes in a later phase.
 */
export function ChannelHeader({ channel, title, members, rights, onDetails, onStar, onMute, onNotifyLevel, preferences, onMarkRead, onCopyLink, onLeave, onArchive, onSearch }: ChannelHeaderProps) {
  const phone = usePhone()
  // What Copy link did, said next to the menu for a moment; there are no toasts outside Undo.
  const [copied, setCopied] = useState<'' | 'Link copied' | "Couldn't copy the link">('')
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(''), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const isChannel = channel.kind === 'channel'
  const noun = isChannel ? 'channel' : 'conversation'
  const bell = isChannel ? 'Channel notifications' : 'Conversation notifications'
  const topic = channel.topic.trim()
  const icon = isChannel && <Icon icon={channel.isPrivate ? IconLock : IconHash} size={18} className="text-sf-text-secondary" />

  return (
    <header className="@container flex h-sf-header flex-none items-center gap-1 ps-4 pe-3">
      <h1 className="flex min-w-0 flex-none items-center">
        {isChannel ? (
          <button
            type="button"
            onClick={() => onDetails('about')}
            aria-label={title}
            className="sf-focus sf-heading inline-flex h-8 max-w-[40cqw] items-center gap-1 rounded-sf-md px-2 whitespace-nowrap text-sf-text hover:bg-sf-surface-hover"
          >
            {icon}
            <span className="truncate">{title}</span>
            <Icon icon={IconChevronDown} size={16} className="text-sf-text-secondary" />
          </button>
        ) : (
          <span className="sf-heading inline-flex h-8 max-w-[40cqw] items-center gap-1 px-2 whitespace-nowrap text-sf-text">
            {icon}
            <span className="truncate">{title}</span>
          </span>
        )}
      </h1>
      <IconButton
        label={`Star ${noun}`}
        icon={channel.starred ? IconStarFilled : IconStar}
        pressed={channel.starred}
        size="sm"
        tone="muted"
        onClick={() => onStar(!channel.starred)}
      />
      <div className="ms-1 hidden min-w-0 flex-1 border-s border-sf-line ps-3 md:block">
        {topic ? (
          <p className="sf-small truncate text-sf-text-secondary" title={topic}>
            {topic}
          </p>
        ) : (
          rights.manage && (
            <button type="button" onClick={() => onDetails('about', true)} className="sf-focus sf-small rounded-sf-sm text-sf-text-muted hover:text-sf-text-secondary">
              Add a topic
            </button>
          )
        )}
      </div>
      <div className="ms-auto flex flex-none items-center gap-1">
        {isChannel && (
          <MembersButton members={members} onClick={() => onDetails('members')} />
        )}
        <span role="status" className="sf-meta text-sf-text-muted">
          {copied}
        </span>
        <NotifyLevelMenu
          channel={channel}
          label={bell}
          preferences={preferences}
          onNotifyLevel={onNotifyLevel}
          onMute={onMute}
          trigger={(props) => (
            <IconButton
              // Says what the crossed-out bell shows: muted (which wins) or Nothing.
              label={channel.muted ? `${bell}: muted` : channel.notifyLevel === 'none' ? `${bell}: nothing` : bell}
              icon={channel.muted || channel.notifyLevel === 'none' ? IconBellOff : IconBell}
              {...props}
            />
          )}
        />
        {onSearch && <IconButton label={isChannel ? 'Search in channel' : 'Search in conversation'} icon={IconSearch} shortcut={['⌘', 'F']} onClick={onSearch} />}
        <Menu label="Channel actions" trigger={(props) => <IconButton label="Channel actions" icon={IconDotsVertical} {...props} />}>
          {phone && topic && <MenuHeading>{topic}</MenuHeading>}
          {isChannel && (
            <MenuItem icon={IconInfoCircle} onSelect={() => onDetails('about')}>
              Channel details
            </MenuItem>
          )}
          {/* The bell's levels, here too (spec 6.1). */}
          <Submenu icon={IconBell} label="Notification settings">
            <NotifyLevelItems channel={channel} preferences={preferences} onNotifyLevel={onNotifyLevel} onMute={onMute} />
          </Submenu>
          <MenuItem
            icon={IconLink}
            onSelect={() => {
              onCopyLink().then(
                () => setCopied('Link copied'),
                () => setCopied("Couldn't copy the link"),
              )
            }}
          >
            Copy link
          </MenuItem>
          <MenuItem icon={IconChecks} disabled={channel.unreadCount === 0} onSelect={onMarkRead}>
            Mark all read
          </MenuItem>
          {(rights.leave || rights.archive) && <MenuSeparator />}
          {rights.leave && (
            <MenuItem icon={IconLogout} onSelect={onLeave}>
              Leave channel
            </MenuItem>
          )}
          {rights.archive && (
            <MenuItem icon={IconArchive} onSelect={onArchive}>
              Archive channel
            </MenuItem>
          )}
        </Menu>
      </div>
    </header>
  )
}

/** Three 20px faces and the member count; it opens Members in Channel details. Hidden when the header is narrow. */
function MembersButton({ members, onClick }: { members: { id: string; name: string }[]; onClick: () => void }) {
  // Named by its visible count plus a hidden noun ("4 members"), so the name starts with what's shown.
  const body = (
    <>
      <span className="inline-flex items-center gap-0.5">
        {members.slice(0, 3).map((p) => (
          <Avatar key={p.id} id={p.id} name={p.name} size="sm" decorative />
        ))}
      </span>
      <span className="tabular-nums">
        {members.length} <span className="sr-only">{members.length === 1 ? 'member' : 'members'}</span>
      </span>
    </>
  )
  const className =
    'hidden h-7 items-center gap-2 rounded-sf-md border border-sf-line-strong bg-sf-surface ps-1 pe-2 font-sf text-[13px]/[18px] font-medium text-sf-text-secondary @min-[560px]:inline-flex'
  return (
    <button type="button" onClick={onClick} className={`sf-focus ${className} hover:bg-sf-surface-hover`}>
      {body}
    </button>
  )
}
