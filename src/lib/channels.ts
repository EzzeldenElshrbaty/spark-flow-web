import type { Channel, MentionItem, User } from '@/api/types'
import { FLOWBOT_READ_ONLY, isFlowbotDm, senderName } from '@/lib/flowbot'

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
  return others.map((id) => senderName(id, users)).join(', ')
}

/** The same list with muted channels and DMs moved to its end, each part in its order (spec 6.11). */
export function mutedLast<T>(list: T[], isMuted: (item: T) => boolean): T[] {
  return [...list.filter((item) => !isMuted(item)), ...list.filter(isMuted)]
}

const muted = (channel: Channel) => channel.muted

/**
 * Channels A–Z; DMs with the newest message first (a DM nobody has written in goes last); muted ones last in each.
 * Flowbot's DM is listed under Apps (spec 5.1), not with the people.
 */
export function sortChannels(channels: Channel[]): { channels: Channel[]; dms: Channel[]; apps: Channel[] } {
  const newestFirst = (list: Channel[]) => mutedLast(list.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '')), muted)
  const dms = channels.filter((c) => c.kind === 'dm')
  return {
    channels: mutedLast(channels.filter((c) => c.kind === 'channel').sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')), muted),
    dms: newestFirst(dms.filter((c) => !isFlowbotDm(c))),
    apps: newestFirst(dms.filter(isFlowbotDm)),
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

/** The line shown instead of the composer, and the server's refusal, in a channel set to Only admins (spec §9). */
export const onlyAdminsLine = (channel: Pick<Channel, 'name'>) => `Only admins can post in #${channel.name}.`

/** The line shown instead of the composer when I may post (react, edit) but not write: Flowbot's DM, or Only admins. */
export const cantWriteLine = (channel: Pick<Channel, 'name' | 'kind' | 'memberIds'>) => (isFlowbotDm(channel) ? FLOWBOT_READ_ONLY : onlyAdminsLine(channel))

/** The line shown instead of the composer to someone who may read a channel but not write in it. */
export const readOnlyFor = (isProjectChannel: boolean) =>
  isProjectChannel ? 'You can read this channel. Only its project’s people can write here.' : 'You can read this channel. Only its members can write here.'

/** My unread mentions in a workspace, per channel: the red badge on its row (Activity has its own count). */
export function unreadMentions(items: MentionItem[] | undefined, workspaceId: string | undefined) {
  const byChannel = new Map<string, number>()
  for (const item of items ?? []) {
    if (item.read || item.workspaceId !== workspaceId || !item.channelId) continue
    byChannel.set(item.channelId, (byChannel.get(item.channelId) ?? 0) + 1)
  }
  return { byChannel }
}

/** My unread task news of a workspace (mentions in task comments, and assigned, moved or commented on, UX Phase 2): the Projects side's dot on the workspace switch (spec 5.5). */
export function unreadTaskMentions(items: MentionItem[] | undefined, workspaceId: string | undefined): number {
  return (items ?? []).filter((item) => !item.read && item.workspaceId === workspaceId && !item.channelId && Boolean(item.taskKey)).length
}

/** The Chat side's count on the workspace switch (spec 5.5): every chat row's red count, by the row rules. */
export function chatCount(rows: { channel: Channel; mentions: number }[]): number {
  return rows.reduce((sum, row) => sum + sidebarRowState(row.channel, row.mentions).count, 0)
}

/**
 * How a sidebar row shows a channel (spec §5.1, 6.11): bold while it has unread messages, with a count by what it
 * notifies me about: every unread message at All (a DM's default), my mentions at Mentions (a channel's), none at
 * Nothing. A muted row is never bold and never has a count.
 */
export function sidebarRowState(channel: Channel, mentions: number): { bold: boolean; count: number; muted: boolean } {
  if (channel.muted) return { bold: false, count: 0, muted: true }
  const count = channel.notifyLevel === 'all' ? channel.unreadCount : channel.notifyLevel === 'mentions' ? mentions : 0
  return { bold: channel.unreadCount > 0, count, muted: false }
}

/** What a row's count is read out as, one and many (sidebarRowState): new messages at All, else my mentions. */
export function countNoun(channel: Pick<Channel, 'notifyLevel'>): [string, string] {
  return channel.notifyLevel === 'all' ? ['new message', 'new messages'] : ['mention', 'mentions']
}
