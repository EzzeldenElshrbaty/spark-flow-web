import type { Channel } from '@/api/types'
import { sidebarRowState } from '@/lib/channels'

/** What a key does on a channel page (spec 10): move through the sidebar, or mark read. */
export type ChannelKeyAction = 'previous' | 'next' | 'previousUnread' | 'nextUnread' | 'markRead' | 'markAllRead' | 'search'

type Rows = { channel: Channel }[]

/** The channels and DMs in the order the sidebar lists them: Starred, then Channels, then Direct messages. */
export function sidebarOrder(groups: { starred: Rows; channels: Rows; dms: Rows }): Channel[] {
  return [...groups.starred, ...groups.channels, ...groups.dms].map((r) => r.channel)
}

/**
 * The channel `dir` rows on from `currentId` (with `unreadOnly`, the next bold one), or null at either end: it doesn't
 * wrap. From a channel the sidebar doesn't list, down starts at the top and up at the bottom.
 */
export function stepChannel(order: Channel[], currentId: string, dir: 1 | -1, unreadOnly: boolean): string | null {
  const at = order.findIndex((c) => c.id === currentId)
  for (let i = (at < 0 ? (dir === 1 ? -1 : order.length) : at) + dir; i >= 0 && i < order.length; i += dir) {
    if (!unreadOnly || sidebarRowState(order[i], 0).bold) return order[i].id
  }
  return null
}

/** F by its letter (any Latin layout, Dvorak too), or by its place when the layout types no Latin letter (Arabic). */
const isF = (e: { key: string; code?: string }) => e.key.toLowerCase() === 'f' || (!/^[a-z]$/i.test(e.key) && e.code === 'KeyF')

/**
 * Alt+↑/↓ (with Shift: unread only), Esc and Shift+Esc, and ⌘/Ctrl+F (search in the channel); anything else, or another modifier, is null.
 */
export function channelKey(e: { key: string; code?: string; altKey: boolean; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): ChannelKeyAction | null {
  if (e.ctrlKey || e.metaKey) return isF(e) && !e.altKey && !e.shiftKey ? 'search' : null
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    const down = e.key === 'ArrowDown'
    return e.shiftKey ? (down ? 'nextUnread' : 'previousUnread') : down ? 'next' : 'previous'
  }
  if (!e.altKey && e.key === 'Escape') return e.shiftKey ? 'markAllRead' : 'markRead'
  return null
}
