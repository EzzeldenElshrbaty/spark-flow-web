import { useProjectSummaries } from '@/api/projects'
import type { Channel } from '@/api/types'
import { useMe } from '@/api/users'
import { readOnlyFor } from '@/lib/channels'
import { usePermission } from '@/lib/usePermission'

/**
 * Whether I may write in a channel, as the server decides it (spec §4.3): a project's channel follows its project;
 * a private one needs membership; the rest are open. `null` while that is still unknown.
 */
export function useCanPost(channel: Channel | undefined): boolean | null {
  const projects = useProjectSummaries(channel?.workspaceId)
  const me = useMe().data
  const check = usePermission()
  if (!channel || !me || projects.isPending) return null
  const project = projects.data?.find((p) => p.channelId === channel.id)
  if (project) return check('collab.post', { project, userTeamIds: me.teamIds })
  return !channel.isPrivate || channel.memberIds.includes(me.id)
}

/** The line shown instead of the composer: who can write in this channel. */
export function useReadOnlyLine(channel: Channel | undefined) {
  const projects = useProjectSummaries(channel?.workspaceId)
  return readOnlyFor(Boolean(channel && projects.data?.some((p) => p.channelId === channel.id)))
}
