import { useCallback, useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useMarkRead, useMarkUnread } from '@/api/chat'
import type { Channel } from '@/api/types'

/**
 * The channel I marked unread (U): being on screen doesn't mark it read again until I leave it or mark it read
 * myself (Esc, the header's Mark all read, the unread bar). One at a time: it's the open channel.
 */
export const useReadHold = create<{ channelId: string | null; hold: (channelId: string) => void; release: (channelId: string) => void }>((set) => ({
  channelId: null,
  hold: (channelId) => set({ channelId }),
  release: (channelId) => set((s) => (s.channelId === channelId ? { channelId: null } : s)),
}))

/**
 * What one visit to the open channel fixed when it began (spec 6.2): where the New line goes, how many were unread,
 * and the read sent on opening. The Messages tab mounts again after another tab of the channel, and reads it back
 * instead of the marker that opening already moved. It ends when I leave the channel.
 */
type Visit = { channelId: string; newAfterSeq: number; unreadOnOpen: number; readOnOpen: number | null; sent: boolean }
export const useChannelVisit = create<{ visit: Visit | null }>(() => ({ visit: null }))

function updateVisit(channelId: string, patch: Partial<Visit>) {
  useChannelVisit.setState((s) => (s.visit?.channelId === channelId ? { visit: { ...s.visit, ...patch } } : s))
}

/** Ends the hold and the visit when I leave the channel: for another one, or another page. Switching tabs inside it isn't leaving. */
export function useReadHoldScope(channelId: string | undefined) {
  useEffect(() => {
    if (!channelId) return
    return () => {
      useReadHold.getState().release(channelId)
      useChannelVisit.setState((s) => (s.visit?.channelId === channelId ? { visit: null } : s))
    }
  }, [channelId])
}

/**
 * Esc (spec 10): marks the open channel read and ends its hold. A held channel is marked read even while its unread
 * count still says 0 (right after U, before the refresh); with nothing unread and nothing held, nothing is sent.
 */
export function markOpenChannelRead(channel: Channel, markRead: (channelId: string) => void) {
  const held = useReadHold.getState().channelId === channel.id
  if (channel.unreadCount === 0 && !held) return
  useReadHold.getState().release(channel.id)
  markRead(channel.id)
}

/**
 * The open channel's read state for its list: where the New line goes (my marker when I opened it, or where U put
 * it), whether the read is held, and the two ways to move the marker. Marking read myself ends the hold.
 *
 * Opening the channel marks it read (spec 6.2), like Slack: up to its newest message at opening (`readOnOpen`), once
 * per visit, while the New line and the unread bar still show where I left off. Not when it's held (U, then another
 * tab of the channel and back) or has nothing unread; a page opened in the background waits until it's shown.
 */
export function useChannelReadState(channel: Channel) {
  // The visit's start, or (back from another tab of the channel) the one already under way.
  const [visit] = useState<Visit>(() => {
    const kept = useChannelVisit.getState().visit
    if (kept?.channelId === channel.id) return kept
    const begun: Visit = {
      channelId: channel.id,
      newAfterSeq: channel.lastReadSeq,
      unreadOnOpen: channel.unreadCount,
      readOnOpen:
        channel.unreadCount > 0 && channel.lastSeq > channel.lastReadSeq && useReadHold.getState().channelId !== channel.id ? channel.lastSeq : null,
      sent: false,
    }
    useChannelVisit.setState({ visit: begun })
    return begun
  })
  const [newAfterSeq, setNewAfterSeq] = useState(visit.newAfterSeq)
  const held = useReadHold((s) => s.channelId === channel.id)
  const { mutate: markRead } = useMarkRead()
  const { mutateAsync: markUnread } = useMarkUnread()
  const { readOnOpen, unreadOnOpen } = visit
  const sentOnOpen = useRef(visit.sent)
  useEffect(() => {
    if (readOnOpen === null) return
    const mark = () => {
      // Held since (U while the page waited in the background): it stays unread.
      if (sentOnOpen.current || document.visibilityState !== 'visible' || useReadHold.getState().channelId === channel.id) return
      sentOnOpen.current = true
      updateVisit(channel.id, { sent: true })
      markRead({ channelId: channel.id, seq: readOnOpen })
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [readOnOpen, channel.id, markRead])
  return {
    newAfterSeq,
    held,
    readOnOpen,
    unreadOnOpen,
    markRead: useCallback(
      (seq?: number) => {
        useReadHold.getState().release(channel.id)
        markRead({ channelId: channel.id, seq })
      },
      [markRead, channel.id],
    ),
    /** U on message `seq`: it and what follows are unread again, and stay so while I'm here. */
    markUnread: useCallback(
      async (seq: number) => {
        // A refused U leaves an earlier one that went through as it was.
        const wasHeld = useReadHold.getState().channelId === channel.id
        useReadHold.getState().hold(channel.id)
        try {
          await markUnread({ channelId: channel.id, seq })
          setNewAfterSeq(seq - 1)
          updateVisit(channel.id, { newAfterSeq: seq - 1 })
        } catch (error) {
          if (!wasHeld) useReadHold.getState().release(channel.id)
          throw error
        }
      },
      [markUnread, channel.id],
    ),
  }
}
