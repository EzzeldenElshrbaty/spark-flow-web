import { useAddMembers } from '@/api/chat'
import type { Channel, User } from '@/api/types'
import { isArchived } from '@/lib/channels'
import { useCanManageChannel } from '@/pages/chat/ChannelActions'
import { useInviteOnSend } from '@/pages/chat/composer/useInviteOnSend'

/** useInviteOnSend for a channel: whoever may manage it adds people with Add people's route; a DM never asks. */
export function useChannelInvite(channel: Channel, people: User[]) {
  const mayManage = useCanManageChannel(channel)
  const addMembers = useAddMembers()
  return useInviteOnSend({
    where: channel.kind === 'channel' ? `#${channel.name}` : 'this conversation',
    // A DM's people are fixed: nobody is "not in" it in a way an invite could change.
    memberIds: channel.kind === 'dm' ? people.map((u) => u.id) : channel.memberIds,
    people,
    mayAdd: mayManage && !isArchived(channel),
    add: (userIds) => addMembers.mutateAsync({ id: channel.id, userIds }),
  })
}
