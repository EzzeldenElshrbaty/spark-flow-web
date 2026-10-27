import type { Channel, Presence, Project } from '@/api/types'
import { useChannels } from '@/api/chat'
import { useProjects } from '@/api/tickets'
import { useUsers } from '@/api/users'
import { channelLabel, sidebarChannels, sortChannels } from '@/lib/channels'
import { projectPeopleIds } from '@/lib/projectPeople'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useRole } from '@/lib/useRole'

/** group: a direct message with more than one other person, so no one presence stands for it. */
export type ChannelRow = { channel: Channel; label: string; presence: Presence; group: boolean }

/** What the sidebar lists for the workspace on screen: channels, direct messages and projects. */
export function useSidebarGroups() {
  const { workspace, isPending: workspaceLoading } = useCurrentWorkspace()
  const { persona } = useRole()
  const channelsQuery = useChannels(workspace?.id)
  const usersQuery = useUsers(workspace?.id)
  const projectsQuery = useProjects(workspace?.id)

  const users = usersQuery.data ?? []
  const sorted = sortChannels(channelsQuery.data ?? [])
  // Channels I'm in, and my projects' chats (their members follow the project).
  const myProjectChannelIds = new Set((projectsQuery.data ?? []).filter((p) => projectPeopleIds(p, users).has(persona.id)).map((p) => p.channelId))
  const row = (channel: Channel): ChannelRow => {
    const other = channel.memberIds.find((id) => id !== persona.id) ?? persona.id
    return { channel, label: channelLabel(channel, users, persona.id), presence: users.find((u) => u.id === other)?.presence ?? 'offline', group: channel.memberIds.length > 2 }
  }
  const projects: Project[] = projectsQuery.data ?? []

  return {
    workspace,
    channels: sidebarChannels(sorted.channels, persona.id, myProjectChannelIds).map(row),
    dms: sorted.dms.map(row),
    projects,
    // The channel list and the people behind DM names arrive separately; show rows only when both are there.
    chatLoading: workspaceLoading || (Boolean(workspace) && (channelsQuery.isPending || usersQuery.isPending)),
    projectsLoading: workspaceLoading || (Boolean(workspace) && projectsQuery.isPending),
    failed: channelsQuery.isError || projectsQuery.isError,
  }
}
