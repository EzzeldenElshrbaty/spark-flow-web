import { IconDotsVertical, IconExternalLink, IconLink } from '@tabler/icons-react'
import { useSetFollowing } from '@/api/chat'
import { IconButton } from '@/components/sf/Button'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { FollowItem } from '@/pages/chat/MessageActions'
import { useCopyLink } from '@/pages/chat/useCopyLink'

/**
 * The thread panel's ⋮ (spec 6.7): Copy link, following (the same item as in the message's ⋯ menu), and Open in a
 * new window. What it did is said under it and read out; a refusal too.
 */
export function ThreadMenu({ messageId, following, link }: { messageId: string; following: boolean; link: string }) {
  const setFollowing = useSetFollowing()
  const { copy, say, note } = useCopyLink(link)
  return (
    <div className="sf relative">
      <Menu label="Thread actions" trigger={(props) => <IconButton label="Thread actions" icon={IconDotsVertical} size="sm" {...props} />}>
        <MenuItem icon={IconLink} onSelect={() => void copy()}>
          Copy link
        </MenuItem>
        <FollowItem following={following} onToggle={() => setFollowing.mutate({ messageId, following: !following }, { onError: () => say("Couldn't change that. Try again.", true) })} />
        <MenuItem icon={IconExternalLink} onSelect={() => window.open(link, '_blank', 'noopener')}>
          Open in a new window
        </MenuItem>
      </Menu>
      {note}
    </div>
  )
}
