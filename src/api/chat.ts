import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { ChannelPatch, ChatTarget, NewChannel, Page, Reaction } from '@/api/types'
import { toggleReaction } from '@/lib/reactions'
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

type PageParam = { dir: 'before' | 'after'; cursor: string }

/**
 * A channel's messages from `seq` on, for a jump (spec 6.2): pages load both ways, older at the end of `pages`
 * (fetchNextPage) and newer at the start (fetchPreviousPage); hasPreviousPage is false once the newest is in.
 */
export function useMessagesFrom(channelId: string | undefined, seq: number | null) {
  return useInfiniteQuery({
    queryKey: qk.messagesFrom(channelId ?? '', seq ?? 0),
    queryFn: ({ pageParam }) => (pageParam.dir === 'before' ? api.chat.messages(channelId!, pageParam.cursor) : api.chat.messagesAfter(channelId!, pageParam.cursor)),
    initialPageParam: { dir: 'after', cursor: String((seq ?? 1) - 1) } as PageParam,
    getNextPageParam: (page, _pages, param): PageParam | undefined => {
      if (param.dir === 'before') return page.nextCursor ? { dir: 'before', cursor: page.nextCursor } : undefined
      // The first page starts at the target: anything older starts below its oldest message.
      const oldest = page.items.at(-1)
      return oldest && oldest.seq > 1 ? { dir: 'before', cursor: String(oldest.seq) } : undefined
    },
    getPreviousPageParam: (page, _pages, param): PageParam | undefined =>
      param.dir === 'after' && page.nextCursor ? { dir: 'after', cursor: page.nextCursor } : undefined,
    retry,
    enabled: Boolean(channelId) && seq !== null,
  })
}

/** Looks up where a jump lands (the seq of the first message at or after `since`), without a mutation's refresh. */
export function useJumpTarget() {
  const queryClient = useQueryClient()
  return (channelId: string, since: string | null) =>
    queryClient.fetchQuery({ queryKey: qk.jumpTarget(channelId, since), queryFn: () => api.chat.jumpTarget(channelId, since), staleTime: 0 })
}

export function useMessage(id: string | undefined) {
  return useQuery({ queryKey: qk.message(id ?? ''), queryFn: () => api.chat.message(id!), retry, enabled: Boolean(id) })
}

/** The replies under one message. */
export function useThread(messageId: string | undefined) {
  return useQuery({ queryKey: qk.replies(messageId ?? ''), queryFn: () => api.chat.replies(messageId!), retry, enabled: Boolean(messageId) })
}

/** Moves my read marker to `seq` (the newest message I've seen); without one, to the channel's end. */
export function useMarkRead() {
  return useMutation({ mutationFn: ({ channelId, seq }: { channelId: string; seq?: number }) => api.chat.markRead(channelId, seq) })
}

/** Posts in a channel as the current user. The feed refreshes from the live event and the global invalidate. */
export function useSendMessage() {
  return useMutation({ mutationFn: ({ channelId, content }: { channelId: string; content: string }) => api.chat.send(channelId, content) })
}
// Where a message or reply can be on screen: a channel's pages, one message, a thread's replies.
const ROWS_KEYS = [['chat', 'messages'], ['chat', 'message'], ['chat', 'replies']]

type Row = { id: string; reactions: Reaction[] }
/** The cached data with `id`'s reactions toggled, whichever shape it is (pages, one message, a list of replies). */
function toggledIn(data: unknown, id: string, emoji: string, meId: string): unknown {
  const fix = <T extends Row>(row: T): T => (row.id === id ? { ...row, reactions: toggleReaction(row.reactions, emoji, meId) ?? row.reactions } : row)
  if (Array.isArray(data)) return data.map(fix)
  if (data && typeof data === 'object' && 'pages' in data) {
    const pages = (data as InfiniteData<Page<Row>>).pages
    return { ...data, pages: pages.map((page) => ({ ...page, items: page.items.map(fix) })) }
  }
  if (data && typeof data === 'object' && 'reactions' in data) return fix(data as Row)
  return data
}

/**
 * Toggles my reaction (spec 6.6): on screen at once, put back if the server refuses; the live event and the refresh
 * after it bring everyone else's view in line.
 */
export function useReact(meId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ target, emoji }: { target: ChatTarget; emoji: string }) => api.chat.react(target, emoji),
    onMutate: async ({ target, emoji }) => {
      if (!meId) return { before: [] as [QueryKey, unknown][] }
      await Promise.all(ROWS_KEYS.map((queryKey) => queryClient.cancelQueries({ queryKey })))
      const before = ROWS_KEYS.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }))
      for (const [key, data] of before) queryClient.setQueryData(key, toggledIn(data, target.id, emoji, meId))
      return { before }
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.before ?? []) queryClient.setQueryData(key, data)
    },
  })
}
export function useEditMessage() {
  return useMutation({ mutationFn: ({ target, content }: { target: ChatTarget; content: string }) => api.chat.edit(target, content) })
}
export function useDeleteMessage() {
  return useMutation({ mutationFn: (target: ChatTarget) => api.chat.remove(target) })
}
export function useOpenDm() {
  return useMutation({ mutationFn: ({ workspaceId, userIds }: { workspaceId: string; userIds: string[] }) => api.chat.openDm(workspaceId, userIds) })
}
export function useCreateChannel() {
  return useMutation({ mutationFn: (input: NewChannel) => api.chat.createChannel(input) })
}
export function useUpdateChannel() {
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: ChannelPatch }) => api.chat.updateChannel(id, patch) })
}
export function useArchiveChannel() {
  return useMutation({ mutationFn: (id: string) => api.chat.archiveChannel(id) })
}
export function useJoinChannel() {
  return useMutation({ mutationFn: (id: string) => api.chat.join(id) })
}
export function useLeaveChannel() {
  return useMutation({ mutationFn: (id: string) => api.chat.leave(id) })
}
export function useRestoreChannel() {
  return useMutation({ mutationFn: (id: string) => api.chat.restoreChannel(id) })
}
export function useReply() {
  return useMutation({ mutationFn: ({ messageId, content }: { messageId: string; content: string }) => api.chat.reply(messageId, content) })
}
export function useSetStarred() {
  return useMutation({ mutationFn: ({ id, starred }: { id: string; starred: boolean }) => api.chat.setStarred(id, starred) })
}
export function useSetMuted() {
  return useMutation({ mutationFn: ({ id, muted }: { id: string; muted: boolean }) => api.chat.setMuted(id, muted) })
}

const PREVIEW_STALE_MS = 60 * 60_000

/** The preview card for one link (spec 6.3); pages don't change often, so it's kept for an hour. */
export function useLinkPreview(url: string | null) {
  return useQuery({ queryKey: qk.linkPreview(url ?? ''), queryFn: () => api.chat.linkPreview(url!), enabled: Boolean(url), staleTime: PREVIEW_STALE_MS, retry: false })
}
