import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

export function useChannels(workspaceId: string) {
  return useQuery({ queryKey: qk.channels(workspaceId), queryFn: () => api.chat.channels(workspaceId), retry })
}

export function useChannel(id: string) {
  return useQuery({ queryKey: qk.channel(id), queryFn: () => api.chat.channel(id), retry })
}

/** A channel's messages, newest first, a page at a time. */
export function useMessages(channelId: string) {
  return useInfiniteQuery({
    queryKey: qk.messages(channelId),
    queryFn: ({ pageParam }) => api.chat.messages(channelId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry,
  })
}

export function useMessage(id: string) {
  return useQuery({ queryKey: qk.message(id), queryFn: () => api.chat.message(id), retry })
}

/** The replies under one message. */
export function useThread(messageId: string) {
  return useQuery({ queryKey: qk.replies(messageId), queryFn: () => api.chat.replies(messageId), retry })
}

export function useMarkRead() {
  return useMutation({ mutationFn: (channelId: string) => api.chat.markRead(channelId) })
}
