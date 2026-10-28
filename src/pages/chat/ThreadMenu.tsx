import { IconDotsVertical, IconExternalLink, IconLink } from '@tabler/icons-react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useSetFollowing } from '@/api/chat'
import { announce } from '@/components/sf/Announcer'
import { IconButton } from '@/components/sf/Button'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { FollowItem } from '@/pages/chat/MessageActions'

/** How long "Link copied" stays; a failure stays until the next one. */
const NOTE_MS = 2000

/**
 * The thread panel's ⋮ (spec 6.7): Copy link, following (the same item as in the message's ⋯ menu), and Open in a
 * new window. What it did is said under it and read out; a refusal too.
 */
export function ThreadMenu({ messageId, following, link }: { messageId: string; following: boolean; link: string }) {
  const setFollowing = useSetFollowing()
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  useEffect(() => {
    if (!note || note.error) return
    const timer = setTimeout(() => setNote(null), NOTE_MS)
    return () => clearTimeout(timer)
  }, [note])
  const say = (text: string, error = false) => {
    setNote({ text, error })
    announce(text)
  }
  // Copied while the click still counts as mine; no clipboard (an insecure page) fails the same way as a refusal.
  const copyLink = () =>
    new Promise<void>((resolve) => resolve(navigator.clipboard.writeText(link))).then(
      () => say('Link copied'),
      () => say("Couldn't copy the link", true),
    )
  return (
    <div className="sf relative">
      <Menu label="Thread actions" trigger={(props) => <IconButton label="Thread actions" icon={IconDotsVertical} size="sm" {...props} />}>
        <MenuItem icon={IconLink} onSelect={() => void copyLink()}>
          Copy link
        </MenuItem>
        <FollowItem following={following} onToggle={() => setFollowing.mutate({ messageId, following: !following }, { onError: () => say("Couldn't change that. Try again.", true) })} />
        <MenuItem icon={IconExternalLink} onSelect={() => window.open(link, '_blank', 'noopener')}>
          Open in a new window
        </MenuItem>
      </Menu>
      {note && (
        <p className={clsx('sf-meta absolute end-0 top-full z-10 mt-1 whitespace-nowrap rounded-sf-md bg-sf-surface-raised px-2 py-1 shadow-sf-menu', note.error ? 'text-sf-error' : 'text-sf-text-secondary')}>
          {note.text}
        </p>
      )}
    </div>
  )
}
