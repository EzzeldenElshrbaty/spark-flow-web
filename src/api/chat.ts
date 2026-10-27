import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { ChatTarget } from '@/api/types'
import { api } from '@/lib/api'

// Every hook below takes an id that may still be unknown (a route param, a lookup in progress): without one it
// asks for nothing instead of firing a request for ''.
export function useChannels(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.channels(workspaceId ?? ''), queryFn: () => api.chat.channels(workspaceId!), retry, enabled: Boolean(workspaceId) })
}

export function useChannel(id: string | undefined) {
  return useQuery({ queryKey: qk.channel(id ?? ''), queryFn: () => api.chat.channel(id!), retry, enabled: Boolean(id) })
}

/** A channel's messages, newest first, a page at a time. */
export function useMessages(channelId: string | undefined) {
  return useInfiniteQuery({
    queryKey: qk.messages(channelId ?? ''),
    queryFn: ({ pageParam }) => api.chat.messages(channelId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry,
    enabled: Boolean(channelId),
  })
}

export function useMessage(id: string | undefined) {
  return useQuery({ queryKey: qk.message(id ?? ''), queryFn: () => api.chat.message(id!), retry, enabled: Boolean(id) })
}

/** The replies under one message. */
export function useThread(messageId: string | undefined) {
  return useQuery({ queryKey: qk.replies(messageId ?? ''), queryFn: () => api.chat.replies(messageId!), retry, enabled: Boolean(messageId) })
}

export function useMarkRead() {
  return useMutation({ mutationFn: (channelId: string) => api.chat.markRead(channelId) })
}

/** Posts in a channel as the current user. The feed refreshes from the live event and the global invalidate. */
export function useSendMessage() {
  return useMutation({ mutationFn: ({ channelId, content }: { channelId: string; content: string }) => api.chat.send(channelId, content) })
}
export function useReact() {
  return useMutation({ mutationFn: ({ target, emoji }: { target: ChatTarget; emoji: string }) => api.chat.react(target, emoji) })
}
export function useEditMessage() {
  return useMutation({ mutationFn: ({ target, content }: { target: ChatTarget; content: string }) => api.chat.edit(target, content) })
}
export function useDeleteMessage() {
  return useMutation({ mutationFn: (target: ChatTarget) => api.chat.remove(target) })
}
export function useReply() {
  return useMutation({ mutationFn: ({ messageId, content }: { messageId: string; content: string }) => api.chat.reply(messageId, content) })
}
