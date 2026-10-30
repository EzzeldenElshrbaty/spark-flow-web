import { useProjectSummaries } from '@/api/projects'
import type { Channel } from '@/api/types'
import { useMe } from '@/api/users'
import { isArchived, readOnlyFor } from '@/lib/channels'
import { isFlowbotDm } from '@/lib/flowbot'
import { usePermission } from '@/lib/usePermission'

/**
 * Whether I may write in a channel, as the server decides it (spec §4.3): a project's channel follows its project;
 * a private one needs membership; the rest are open. `null` while that is still unknown.
 */
export function useCanPost(channel: Channel | undefined): boolean | null {
  const projects = useProjectSummaries(channel?.workspaceId)
  const me = useMe().data
  const check = usePermission()
  if (channel && isArchived(channel)) return false
  // Unknown while projects load or fail: a project's channel follows the project, so don't guess.
  if (!channel || !me || projects.isPending || projects.isError) return null
  const project = projects.data?.find((p) => p.channelId === channel.id)
  if (project) return check('collab.post', { project, userTeamIds: me.teamIds })
  return !channel.isPrivate || channel.memberIds.includes(me.id)
}

/**
 * Whether the composer is mine to use (spec §9): useCanPost, and in a channel set to Only admins, being an Admin.
 * Reactions, edits and deletes still go by useCanPost. Nobody writes in Flowbot's DM. `null` while that is still unknown.
 */
export function useCanWrite(channel: Channel | undefined): boolean | null {
  const canPost = useCanPost(channel)
  const check = usePermission()
  if (channel && isFlowbotDm(channel)) return false
  return canPost === true ? check('channel.post', { channel: channel! }) : canPost
}

/** The line shown instead of the composer: who can write in this channel. */
export function useReadOnlyLine(channel: Channel | undefined) {
  const projects = useProjectSummaries(channel?.workspaceId)
  if (channel && isArchived(channel)) return 'This channel is archived.'
  return readOnlyFor(Boolean(channel && projects.data?.some((p) => p.channelId === channel.id)))
}
