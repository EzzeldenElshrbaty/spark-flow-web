import type { Channel, MentionItem, User } from '@/api/types'

/** Whether a channel is archived (read-only until restored). */
export const isArchived = (channel: { archivedAt?: string | null }): boolean => Boolean(channel.archivedAt)

/** What the UI calls a channel: its name, or for a DM the other members' names. */
export function channelLabel(channel: Channel, users: User[], meId: string): string {
  if (channel.kind === 'channel') return channel.name ?? ''
  const others = channel.memberIds.filter((id) => id !== meId)
  if (others.length === 0) {
    if (!channel.memberIds.includes(meId)) return 'Unknown person'
    return `${users.find((u) => u.id === meId)?.name ?? 'Unknown person'} (you)`
  }
  return others.map((id) => users.find((u) => u.id === id)?.name ?? 'Unknown person').join(', ')
}

/** Channels A–Z; DMs with the newest message first (a DM nobody has written in goes last). */
export function sortChannels(channels: Channel[]): { channels: Channel[]; dms: Channel[] } {
  return {
    channels: channels.filter((c) => c.kind === 'channel').sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
    dms: channels
      .filter((c) => c.kind === 'dm')
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')),
  }
}

/**
 * The channels the sidebar lists: the ones I'm in, and the chats of my projects; never archived ones. Other public
 * channels are found through search, where Join adds them.
 */
export function sidebarChannels(channels: Channel[], meId: string, myProjectChannelIds: Set<string>): Channel[] {
  return channels.filter((c) => !isArchived(c) && (c.memberIds.includes(meId) || myProjectChannelIds.has(c.id)))
}

/** Whether a channel belongs to the workspace in the URL. One from another workspace is treated as not found there. */
export function inWorkspace(channel: Pick<Channel, 'workspaceId'>, workspaceId: string | undefined): boolean {
  return Boolean(workspaceId) && channel.workspaceId === workspaceId
}

/**
 * Whether I must join a channel before writing in it (in the channel or a thread): a public channel I'm not in that no
 * project owns (a project's people follow the project). False until the projects are known, so the line doesn't flash.
 */
export function mustJoin(channel: Channel, meId: string, projects: { channelId: string }[] | undefined): boolean {
  return channel.kind === 'channel' && !channel.isPrivate && !channel.memberIds.includes(meId) && projects !== undefined && !projects.some((p) => p.channelId === channel.id)
}

/** The line shown instead of the composer to someone who may read a channel but not write in it. */
export const readOnlyFor = (isProjectChannel: boolean) =>
  isProjectChannel ? 'You can read this channel. Only its project’s people can write here.' : 'You can read this channel. Only its members can write here.'

/**
 * My unread mentions in a workspace: the total (the sidebar's Activity count) and per channel (the red badge on
 * its row; a channel's other unread messages only make the row bold).
 */
export function unreadMentions(items: MentionItem[] | undefined, workspaceId: string | undefined) {
  const byChannel = new Map<string, number>()
  let total = 0
  for (const item of items ?? []) {
    if (item.read || item.workspaceId !== workspaceId) continue
    total++
    if (item.channelId) byChannel.set(item.channelId, (byChannel.get(item.channelId) ?? 0) + 1)
  }
  return { total, byChannel }
}

/**
 * How a sidebar row shows a channel (spec §5.1): bold while it has unread messages, with a count of my mentions (every
 * unread message in a DM). A muted row is never bold and never has a count.
 */
export function sidebarRowState(channel: Channel, mentions: number): { bold: boolean; count: number; muted: boolean } {
  if (channel.muted) return { bold: false, count: 0, muted: true }
  return { bold: channel.unreadCount > 0, count: channel.kind === 'dm' ? channel.unreadCount : mentions, muted: false }
}
