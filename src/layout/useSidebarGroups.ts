import type { Channel, Presence, Project } from '@/api/types'
import { useChannels, useDrafts } from '@/api/chat'
import { useActivity } from '@/api/inbox'
import { useSaved } from '@/api/saved'
import { useScheduled } from '@/api/scheduled'
import { useMyMentions } from '@/api/mentions'
import { useProjects } from '@/api/tickets'
import { useUsers } from '@/api/users'
import { channelLabel, mutedLast, sidebarChannels, sortChannels, unreadMentions } from '@/lib/channels'
import { isFlowbotDm } from '@/lib/flowbot'
import { projectPeopleIds } from '@/lib/projectPeople'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useRole } from '@/lib/useRole'

/** group: a direct message with more than one other person, so no one presence stands for it. */
export type ChannelRow = { channel: Channel; label: string; presence: Presence; group: boolean; /** The person a 1:1 DM is with (me, for my own notes). */ otherId: string; /** I have an unsent draft there. */ draft: boolean }

/** What the sidebar lists for the workspace on screen: channels, direct messages, apps, projects and unread mentions. */
export function useSidebarGroups() {
  const { workspace, isPending: workspaceLoading } = useCurrentWorkspace()
  const { persona } = useRole()
  const channelsQuery = useChannels(workspace?.id)
  const drafts = useDrafts(workspace?.id)
  const drafted = new Set((drafts.data ?? []).map((d) => d.channelId))
  const usersQuery = useUsers(workspace?.id)
  const projectsQuery = useProjects(workspace?.id)
  const mentionsQuery = useMyMentions(Boolean(persona.id))
  const activityQuery = useActivity(workspace?.id)
  const savedQuery = useSaved(workspace?.id)
  const scheduledQuery = useScheduled(workspace?.id)

  const users = usersQuery.data ?? []
  const sorted = sortChannels(channelsQuery.data ?? [])
  // Channels I'm in, and my projects' chats (their members follow the project).
  const myProjectChannelIds = new Set((projectsQuery.data ?? []).filter((p) => projectPeopleIds(p, users).has(persona.id)).map((p) => p.channelId))
  const row = (channel: Channel): ChannelRow => {
    const other = channel.memberIds.find((id) => id !== persona.id) ?? persona.id
    return { channel, label: channelLabel(channel, users, persona.id), presence: users.find((u) => u.id === other)?.presence ?? 'offline', group: channel.memberIds.length > 2, otherId: other, draft: drafted.has(channel.id) }
  }
  const projects: Project[] = projectsQuery.data ?? []

  // A starred channel or DM is listed once, under Starred (spec §5.1).
  const listed = [...sidebarChannels(sorted.channels, persona.id, myProjectChannelIds), ...sorted.dms, ...sorted.apps].map(row)

  return {
    workspace,
    starred: mutedLast(listed.filter((r) => r.channel.starred), (r) => r.channel.muted),
    channels: listed.filter((r) => r.channel.kind === 'channel' && !r.channel.starred),
    dms: listed.filter((r) => r.channel.kind === 'dm' && !isFlowbotDm(r.channel) && !r.channel.starred),
    /** Flowbot's DM (spec 5.1 Apps), once Flowbot has written. */
    apps: listed.filter((r) => isFlowbotDm(r.channel) && !r.channel.starred),
    projects,
    /** My unread mentions here: each channel row's badge. */
    mentions: unreadMentions(mentionsQuery.data, workspace?.id),
    /** Unread items in my Activity here (spec 6.12): its row's count. */
    activityUnread: (activityQuery.data ?? []).filter((item) => !item.read).length,
    /** My In progress saved items here (spec 5.1): the Saved row's muted count. */
    savedInProgress: (savedQuery.data ?? []).filter((item) => item.status === 'inProgress').length,
    /** My drafts plus scheduled messages here (spec 5.1): the Drafts & sent row's muted count. */
    draftsAndScheduled: (drafts.data?.length ?? 0) + (scheduledQuery.data?.length ?? 0),
    // The channel list and the people behind DM names arrive separately; show rows only when both are there.
    chatLoading: workspaceLoading || (Boolean(workspace) && (channelsQuery.isPending || usersQuery.isPending)),
    projectsLoading: workspaceLoading || (Boolean(workspace) && projectsQuery.isPending),
    failed: channelsQuery.isError || projectsQuery.isError,
  }
}
