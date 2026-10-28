import { describe, expect, it } from 'vitest'
import type { Channel } from '@/api/types'
import { channelKey, sidebarOrder, stepChannel } from '@/pages/chat/channelKeys'

const channel = (id: string, over: Partial<Channel> = {}): Channel => ({
  id, workspaceId: 'ws-eng', kind: 'channel', name: id, topic: '', memberIds: ['u-1'], isPrivate: false, lastMessageAt: null,
  unreadCount: 0, lastSeq: 5, lastReadSeq: 5, starred: false, muted: false, notifyLevel: 'all', ...over,
})
const row = (c: Channel) => ({ channel: c })

const starred = channel('star', { starred: true })
const backend = channel('backend', { unreadCount: 2 })
const design = channel('design', { unreadCount: 4, muted: true })
const frontend = channel('frontend')
const dm = channel('dm-nour', { kind: 'dm', name: null, unreadCount: 1 })
const order = sidebarOrder({ starred: [row(starred)], channels: [row(backend), row(design), row(frontend)], dms: [row(dm)] })

describe('sidebarOrder (spec 10: Alt+↑/↓ follow the sidebar)', () => {
  it('is Starred, then Channels, then Direct messages, as the sidebar lists them', () => {
    expect(order.map((c) => c.id)).toEqual(['star', 'backend', 'design', 'frontend', 'dm-nour'])
  })
})

describe('stepChannel', () => {
  it('goes to the next or previous row, and stops at either end', () => {
    expect(stepChannel(order, 'backend', 1, false)).toBe('design')
    expect(stepChannel(order, 'backend', -1, false)).toBe('star')
    expect(stepChannel(order, 'dm-nour', 1, false)).toBeNull()
    expect(stepChannel(order, 'star', -1, false)).toBeNull()
  })

  it('unread only goes to the next bold row: muted and read channels are passed over', () => {
    expect(stepChannel(order, 'backend', 1, true)).toBe('dm-nour')
    expect(stepChannel(order, 'dm-nour', -1, true)).toBe('backend')
    expect(stepChannel(order, 'star', -1, true)).toBeNull()
  })

  it('from a channel the sidebar does not list, down starts at the top and up at the bottom', () => {
    expect(stepChannel(order, 'not-mine', 1, false)).toBe('star')
    expect(stepChannel(order, 'not-mine', -1, false)).toBe('dm-nour')
    expect(stepChannel(order, 'not-mine', 1, true)).toBe('backend')
  })
})

describe('channelKey', () => {
  const key = (key: string, mods: Partial<Record<'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) =>
    channelKey({ key, altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...mods })

  it('reads Alt+↑/↓, with Shift for unread only', () => {
    expect(key('ArrowDown', { altKey: true })).toBe('next')
    expect(key('ArrowUp', { altKey: true })).toBe('previous')
    expect(key('ArrowDown', { altKey: true, shiftKey: true })).toBe('nextUnread')
    expect(key('ArrowUp', { altKey: true, shiftKey: true })).toBe('previousUnread')
  })

  it('reads Esc and Shift+Esc', () => {
    expect(key('Escape')).toBe('markRead')
    expect(key('Escape', { shiftKey: true })).toBe('markAllRead')
  })

  it('leaves other keys and other modifiers alone', () => {
    expect(key('ArrowDown')).toBeNull()
    expect(key('ArrowDown', { altKey: true, metaKey: true })).toBeNull()
    expect(key('ArrowUp', { altKey: true, ctrlKey: true })).toBeNull()
    expect(key('Escape', { altKey: true })).toBeNull()
    expect(key('Escape', { metaKey: true })).toBeNull()
    expect(key('u')).toBeNull()
  })
})
