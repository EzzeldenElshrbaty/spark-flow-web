import { describe, expect, it } from 'vitest'
import type { Channel, MentionItem } from '@/api/types'
import { channelLabel, inWorkspace, mustJoin, readOnlyFor, sidebarChannels, sidebarRowState, sortChannels, unreadMentions } from '@/lib/channels'
import { seed } from '@/mocks/seed'

const data = seed(new Date('2026-10-26T09:00:00Z')).data
const users = data.users
const me = users.find((u) => u.id === 'u-1')!
const other = users.find((u) => u.id === 'u-2')!

const dm = (memberIds: string[]): Channel => ({
  id: 'c-x', workspaceId: 'ws-eng', kind: 'dm', name: null, topic: '', memberIds, isPrivate: true, lastMessageAt: null, unreadCount: 0,
  lastSeq: 0, lastReadSeq: 0, starred: false, muted: false, notifyLevel: 'all',
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

describe('inWorkspace', () => {
  it('accepts a channel of the workspace on screen', () => {
    expect(inWorkspace(channel('general'), 'ws-eng')).toBe(true)
  })

  it('rejects a channel of another workspace, or when the workspace is unknown', () => {
    expect(inWorkspace(channel('general'), 'ws-design')).toBe(false)
    expect(inWorkspace(channel('general'), undefined)).toBe(false)
  })
})

describe('readOnlyFor', () => {
  it('says who can write, for a project channel or a private one', () => {
    expect(readOnlyFor(true)).toBe('You can read this channel. Only its project’s people can write here.')
    expect(readOnlyFor(false)).toBe('You can read this channel. Only its members can write here.')
  })
})

describe('sidebarChannels', () => {
  const ch = (id: string, memberIds: string[], archivedAt: string | null = null) => ({ id, kind: 'channel', name: id, memberIds, archivedAt }) as unknown as Channel
  it("keeps my channels and my projects' channels, not other public or archived ones", () => {
    const list = [ch('mine', ['u1']), ch('other', ['u2']), ch('proj', ['u2']), ch('old', ['u1'], '2026-10-01T00:00:00.000Z')]
    expect(sidebarChannels(list, 'u1', new Set(['proj'])).map((c) => c.id)).toEqual(['mine', 'proj'])
  })
})


describe('unreadMentions', () => {
  const item = (over: Partial<MentionItem>): MentionItem => ({
    id: 'm', source: 'message', authorId: 'u-2', authorName: 'Hala', excerpt: '', createdAt: '2026-10-26T09:00:00Z',
    read: false, workspaceId: 'ws-eng', channelId: 'c-general', messageId: 'x', taskKey: null, projectId: null, ...over,
  })

  it('counts my unread mentions per channel of the workspace on screen', () => {
    const counts = unreadMentions(
      [
        item({ id: '1' }),
        item({ id: '2', source: 'reply' }),
        item({ id: '3', read: true }),
        item({ id: '4', channelId: 'c-backend' }),
        item({ id: '5', workspaceId: 'ws-design', channelId: 'c-design' }),
        item({ id: '6', source: 'comment', channelId: null, taskKey: 'NEX-1' }),
      ],
      'ws-eng',
    )
    expect(counts.byChannel.get('c-general')).toBe(2)
    expect(counts.byChannel.get('c-backend')).toBe(1)
    expect(counts.byChannel.has('c-design')).toBe(false)
    // Activity counts every unread mention in the workspace, task comments included.
    expect(counts.total).toBe(4)
  })

  it('is empty before the mentions load', () => {
    expect(unreadMentions(undefined, 'ws-eng')).toEqual({ total: 0, byChannel: new Map() })
  })
})

describe('sidebarRowState (spec §5.1 row rules)', () => {
  const state = { lastSeq: 5, lastReadSeq: 2, starred: false, muted: false, notifyLevel: 'all' as const }
  it('a channel with unread is bold and counts only my mentions', () => {
    expect(sidebarRowState({ ...channel('a'), ...state, unreadCount: 3 }, 1)).toEqual({ bold: true, count: 1, muted: false })
    expect(sidebarRowState({ ...channel('a'), ...state, unreadCount: 3 }, 0)).toEqual({ bold: true, count: 0, muted: false })
  })
  it('a DM counts every unread message', () => {
    expect(sidebarRowState({ ...dm([me.id, other.id]), ...state, unreadCount: 3 }, 0)).toEqual({ bold: true, count: 3, muted: false })
  })
  it('a read row is plain', () => {
    expect(sidebarRowState({ ...channel('a'), ...state, unreadCount: 0 }, 0)).toEqual({ bold: false, count: 0, muted: false })
  })
  it('a muted row is never bold and never has a count', () => {
    expect(sidebarRowState({ ...channel('a'), ...state, muted: true, unreadCount: 3 }, 2)).toEqual({ bold: false, count: 0, muted: true })
    expect(sidebarRowState({ ...dm([me.id, other.id]), ...state, muted: true, unreadCount: 3 }, 0)).toEqual({ bold: false, count: 0, muted: true })
  })
})

describe('mustJoin (post in a public channel: join it first)', () => {
  const projects = [{ channelId: 'c-p-nex' }]
  it('a public channel I’m not in, that no project owns', () => {
    expect(mustJoin({ ...channel('random'), memberIds: ['u-2'] }, 'u-1', projects)).toBe(true)
  })
  it('not when I’m in it, it’s private, a DM, or a project’s channel (its people follow the project)', () => {
    expect(mustJoin({ ...channel('random'), memberIds: ['u-1'] }, 'u-1', projects)).toBe(false)
    expect(mustJoin({ ...channel('random'), isPrivate: true }, 'u-1', projects)).toBe(false)
    expect(mustJoin(dm(['u-2']), 'u-1', projects)).toBe(false)
    expect(mustJoin({ ...channel('nex'), id: 'c-p-nex' }, 'u-1', projects)).toBe(false)
  })
  it('not before the projects are known (no flash of Join channel)', () => {
    expect(mustJoin({ ...channel('random'), memberIds: ['u-2'] }, 'u-1', undefined)).toBe(false)
  })
})
