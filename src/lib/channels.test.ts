import { describe, expect, it } from 'vitest'
import type { Channel } from '@/api/types'
import { channelLabel, sortChannels } from '@/lib/channels'
import { seed } from '@/mocks/seed'

const data = seed(new Date('2026-10-26T09:00:00Z'))
const users = data.users
const me = users.find((u) => u.id === 'u-1')!
const other = users.find((u) => u.id === 'u-2')!

const dm = (memberIds: string[]): Channel => ({
  id: 'c-x', workspaceId: 'ws-eng', kind: 'dm', name: null, topic: '', memberIds, isPrivate: true, lastMessageAt: null, unreadCount: 0,
})
const channel = (name: string, lastMessageAt: string | null = null): Channel => ({ ...dm([]), id: `c-${name}`, kind: 'channel', name, isPrivate: false, lastMessageAt })

describe('channelLabel', () => {
  it('names a channel after its name', () => {
    expect(channelLabel(channel('general'), users, me.id)).toBe('general')
  })

  it('names a DM after the other member', () => {
    expect(channelLabel(dm([me.id, other.id]), users, me.id)).toBe(other.name)
  })

  it('joins the other members of a group DM', () => {
    expect(channelLabel(dm([me.id, other.id, 'u-3']), users, me.id)).toBe(`${other.name}, ${users.find((u) => u.id === 'u-3')!.name}`)
  })

  it('names a DM with yourself "<name> (you)"', () => {
    expect(channelLabel(dm([me.id]), users, me.id)).toBe(`${me.name} (you)`)
  })

  it('names an unknown member "Unknown person"', () => {
    expect(channelLabel(dm([me.id, 'u-99']), users, me.id)).toBe('Unknown person')
  })
})

describe('sortChannels', () => {
  it('sorts channels A–Z and DMs by latest message', () => {
    const list = [
      channel('release'),
      { ...dm(['u-1', 'u-2']), id: 'c-old', lastMessageAt: '2026-10-24T10:00:00Z' },
      channel('backend'),
      { ...dm(['u-1', 'u-3']), id: 'c-new', lastMessageAt: '2026-10-26T08:00:00Z' },
      { ...dm(['u-1', 'u-4']), id: 'c-none', lastMessageAt: null },
    ]
    const { channels, dms } = sortChannels(list)
    expect(channels.map((c) => c.name)).toEqual(['backend', 'release'])
    expect(dms.map((c) => c.id)).toEqual(['c-new', 'c-old', 'c-none'])
  })
})
