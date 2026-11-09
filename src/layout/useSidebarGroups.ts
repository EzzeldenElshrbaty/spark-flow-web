import type { Channel, Presence, Project } from '@/api/types'
import { useChannels, useDrafts } from '@/api/chat'
import { useActivity } from '@/api/inbox'
import { useSaved } from '@/api/saved'
import { useScheduled } from '@/api/scheduled'
import { useShownSidebarOrder } from '@/api/sidebar'
import { useThreads } from '@/api/threads'
import { applyOrder } from '@/lib/sidebarOrder'
import { useMyMentions } from '@/api/mentions'
import { useProjects } from '@/api/tickets'
import { useUsers } from '@/api/users'
import { channelLabel, chatCount, sidebarChannels, sortChannels, unreadMentions, unreadTaskMentions } from '@/lib/channels'
import { isFlowbotDm } from '@/lib/flowbot'
import { projectPeopleIds } from '@/lib/projectPeople'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useRole } from '@/lib/useRole'

/** group: a direct message with more than one other person, so no one presence stands for it. */
export type ChannelRow = { channel: Channel; label: string; presence: Presence; group: boolean; /** The person a 1:1 DM is with (me, for my own notes). */ otherId: string; /** Their name, which colours the avatar (the label may say "(you)"). */ otherName: string; /** I have an unsent draft there. */ draft: boolean }

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
  // The Threads view's own first page: the sidebar and the view share it.
  const threadsQuery = useThreads(workspace?.id)
  // My order of Starred and Channels (spec 5.1 drag to reorder).
  const orderQuery = useShownSidebarOrder(workspace?.id)
  const order = orderQuery.data

  const users = usersQuery.data ?? []
  const sorted = sortChannels(channelsQuery.data ?? [])
  // Channels I'm in, and my projects' chats (their members follow the project).
  const myProjectChannelIds = new Set((projectsQuery.data ?? []).filter((p) => projectPeopleIds(p, users).has(persona.id)).map((p) => p.channelId))
  const row = (channel: Channel): ChannelRow => {
    const other = channel.memberIds.find((id) => id !== persona.id) ?? persona.id
    return { channel, label: channelLabel(channel, users, persona.id), presence: users.find((u) => u.id === other)?.presence ?? 'offline', group: channel.memberIds.length > 2, otherId: other, otherName: users.find((u) => u.id === other)?.name ?? channelLabel(channel, users, persona.id), draft: drafted.has(channel.id) }
  }
  // In my order (spec 5.1, slice Y+); projects have no muted rows. Filled in once the order has arrived.
  let projects: Project[] = projectsQuery.data ?? []

  // A starred channel or DM is listed once, under Starred (spec §5.1).
  const listed = [...sidebarChannels(sorted.channels, persona.id, myProjectChannelIds), ...sorted.dms, ...sorted.apps].map(row)

  const mentions = unreadMentions(mentionsQuery.data, workspace?.id)
  const idOf = (r: ChannelRow) => r.channel.id
  projects = applyOrder(projects, order?.projects, (p) => p.id, () => false)
  // Only an order that still names a listed row counts (stale ids are dropped by the server as rows move or go).
  const ownOrder = (rows: ChannelRow[], saved: string[] | undefined) => Boolean(saved?.some((id) => rows.some((r) => r.channel.id === id)))
  const isMuted = (r: ChannelRow) => r.channel.muted
  const starred = applyOrder(listed.filter((r) => r.channel.starred), order?.starred, idOf, isMuted)
  const channels = applyOrder(listed.filter((r) => r.channel.kind === 'channel' && !r.channel.starred), order?.channels, idOf, isMuted)
  const dms = listed.filter((r) => r.channel.kind === 'dm' && !isFlowbotDm(r.channel) && !r.channel.starred)
  const apps = listed.filter((r) => isFlowbotDm(r.channel) && !r.channel.starred)
  // As the rows show them: Starred and Channels count my mentions there, DMs and Apps their messages.
  const withMentions = (r: ChannelRow) => ({ channel: r.channel, mentions: mentions.byChannel.get(r.channel.id) ?? 0 })
  const ownCount = (r: ChannelRow) => ({ channel: r.channel, mentions: 0 })

  return {
    workspace,
    starred,
    channels,
    dms,
    /** Flowbot's DM (spec 5.1 Apps), once Flowbot has written. */
    apps,
    projects,
    /** My unread mentions here: each channel row's badge. */
    mentions,
    /** The Chat side's count on the workspace switch (spec 5.5): every chat row's red count. */
    chatCount: chatCount([...starred.map(withMentions), ...channels.map(withMentions), ...dms.map(ownCount), ...apps.map(ownCount)]),
    /** My unread mentions in task comments here: the Projects side's dot (spec 5.5). */
    projectNews: unreadTaskMentions(mentionsQuery.data, workspace?.id),
    /** Unread items in my Activity here (spec 6.12): its row's count. */
    activityUnread: (activityQuery.data ?? []).filter((item) => !item.read).length,
    /** Followed threads here with replies I haven't read (spec 6.12): the Threads row's muted count. */
    threadsUnread: threadsQuery.data?.pages[0]?.unreadThreads ?? 0,
    /** Whether I ordered a section myself: its ⋯ then offers Sort A–Z (Reset order for Projects). */
    customOrder: {
      starred: ownOrder(starred, order?.starred),
      channels: ownOrder(channels, order?.channels),
      projects: Boolean(order?.projects.some((id) => projects.some((p) => p.id === id))),
    },
    /** My In progress saved items here (spec 5.1): the Saved row's muted count. */
    savedInProgress: (savedQuery.data ?? []).filter((item) => item.status === 'inProgress').length,
    /** My drafts plus scheduled messages here (spec 5.1): the Drafts & sent row's muted count. */
    draftsAndScheduled: (drafts.data?.length ?? 0) + (scheduledQuery.data?.length ?? 0),
    // The channel list and the people behind DM names arrive separately; show rows only when both are there.
    // My order too, so the rows don't jump from A–Z into it.
    chatLoading: workspaceLoading || (Boolean(workspace) && (channelsQuery.isPending || usersQuery.isPending || orderQuery.isPending)),
    projectsLoading: workspaceLoading || (Boolean(workspace) && (projectsQuery.isPending || orderQuery.isPending)),
    failed: channelsQuery.isError || projectsQuery.isError,
  }
}
