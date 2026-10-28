import { useCallback, useEffect, useState } from 'react'
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
 * The open channel's read state for its list: where the New line goes (my marker when I opened it, or where U put
 * it), whether the read is held, and the two ways to move the marker. Marking read myself ends the hold.
 */
export function useChannelReadState(channel: Channel) {
  const [newAfterSeq, setNewAfterSeq] = useState(channel.lastReadSeq)
  const held = useReadHold((s) => s.channelId === channel.id)
  const { mutate: markRead } = useMarkRead()
  const { mutateAsync: markUnread } = useMarkUnread()
  return {
    newAfterSeq,
    held,
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
        useReadHold.getState().hold(channel.id)
        try {
          await markUnread({ channelId: channel.id, seq })
          setNewAfterSeq(seq - 1)
        } catch (error) {
          useReadHold.getState().release(channel.id)
          throw error
        }
      },
      [markUnread, channel.id],
    ),
  }
}
