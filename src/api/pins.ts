import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/** A channel's pinned messages, newest pin first (spec 6.1 Pins tab); a pin anywhere in it refreshes them. */
export function usePins(channelId: string | undefined) {
  return useQuery({ queryKey: qk.pins(channelId ?? ''), queryFn: () => api.pins.list(channelId!), retry, enabled: Boolean(channelId) })
}

/** Pin to channel / Unpin from channel (spec 6.5, P). */
export function useSetPinned() {
  return useMutation({ mutationFn: ({ messageId, pinned }: { messageId: string; pinned: boolean }) => (pinned ? api.pins.pin(messageId) : api.pins.unpin(messageId)) })
}
