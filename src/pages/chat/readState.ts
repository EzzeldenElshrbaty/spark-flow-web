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

/** Ends the hold when I leave the channel: for another one, or another page. Switching tabs inside it isn't leaving. */
export function useReadHoldScope(channelId: string | undefined) {
  useEffect(() => {
    if (!channelId) return
    return () => useReadHold.getState().release(channelId)
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
  const [newAfterSeq, setNewAfterSeq] = useState(channel.lastReadSeq)
  const held = useReadHold((s) => s.channelId === channel.id)
  const { mutate: markRead } = useMarkRead()
  const { mutateAsync: markUnread } = useMarkUnread()
  const [readOnOpen] = useState(() =>
    channel.unreadCount > 0 && channel.lastSeq > channel.lastReadSeq && useReadHold.getState().channelId !== channel.id ? channel.lastSeq : null,
  )
  const sentOnOpen = useRef(false)
  useEffect(() => {
    if (readOnOpen === null) return
    const mark = () => {
      // Held since (U while the page waited in the background): it stays unread.
      if (sentOnOpen.current || document.visibilityState !== 'visible' || useReadHold.getState().channelId === channel.id) return
      sentOnOpen.current = true
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
        } catch (error) {
          if (!wasHeld) useReadHold.getState().release(channel.id)
          throw error
        }
      },
      [markUnread, channel.id],
    ),
  }
}
