import type { Channel, User } from '@/api/types'

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
