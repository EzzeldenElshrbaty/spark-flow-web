import { IconDotsVertical, IconExternalLink, IconLink } from '@tabler/icons-react'
import { useSetFollowing } from '@/api/chat'
import { announce } from '@/components/sf/Announcer'
import { IconButton } from '@/components/sf/Button'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { FollowItem } from '@/pages/chat/MessageActions'

/**
 * The thread panel's ⋮ (spec 6.7): Copy link, following (the same item as in the message's ⋯ menu), and Open in a
 * new window. What it did is read out; a refusal too.
 */
export function ThreadMenu({ messageId, following, link }: { messageId: string; following: boolean; link: string }) {
  const setFollowing = useSetFollowing()
  // Copied while the click still counts as mine; no clipboard (an insecure page) fails the same way as a refusal.
  const copyLink = () =>
    new Promise<void>((resolve) => resolve(navigator.clipboard.writeText(link))).then(
      () => announce('Link copied'),
      () => announce("Couldn't copy the link"),
    )
  return (
    <div className="sf">
      <Menu label="Thread actions" trigger={(props) => <IconButton label="Thread actions" icon={IconDotsVertical} size="sm" {...props} />}>
        <MenuItem icon={IconLink} onSelect={() => void copyLink()}>
          Copy link
        </MenuItem>
        <FollowItem following={following} onToggle={() => setFollowing.mutate({ messageId, following: !following }, { onError: () => announce("Couldn't change that. Try again.") })} />
        <MenuItem icon={IconExternalLink} onSelect={() => window.open(link, '_blank', 'noopener')}>
          Open in a new window
        </MenuItem>
      </Menu>
    </div>
  )
}
