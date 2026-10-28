import type { ChannelKind, ChannelMemberState } from '@/api/types'
import type { DbData } from './db'

/** A channel tells me about my mentions, a DM about every message (spec 6.11), until I choose otherwise. */
export const freshState = (kind: ChannelKind = 'channel'): ChannelMemberState => ({ lastReadSeq: 0, starred: false, muted: false, notifyLevel: kind === 'dm' ? 'all' : 'mentions' })

/** Whether this person may read a channel: a private one (or a DM) only its members. */
export const canRead = (data: DbData, channelId: string, userId: string) => {
  const channel = data.channels.find((c) => c.id === channelId)
  return Boolean(channel) && (!channel!.isPrivate || channel!.memberIds.includes(userId))
}

/** This person's state in a channel, or its defaults (a channel: mentions; a DM: all). */
export function stateOf(data: DbData, userId: string, channelId: string): ChannelMemberState {
  return data.channelState[userId]?.[channelId] ?? freshState(data.channels.find((c) => c.id === channelId)?.kind)
}

/** Channels this person set to Nothing (spec 6.11): they stay out of Activity and the bell. */
export function silenced(data: DbData, userId: string): (channelId: string | null) => boolean {
  return (channelId) => Boolean(channelId) && stateOf(data, userId, channelId!).notifyLevel === 'none'
}
