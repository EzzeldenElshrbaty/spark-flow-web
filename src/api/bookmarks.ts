import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/** A channel's bookmarks, in the order added (spec 6.1); a change in the channel refreshes them. */
export function useBookmarks(channelId: string | undefined) {
  return useQuery({ queryKey: qk.bookmarks(channelId ?? ''), queryFn: () => api.bookmarks.list(channelId!), retry, enabled: Boolean(channelId) })
}

export function useAddBookmark() {
  return useMutation({ mutationFn: ({ channelId, bookmark }: { channelId: string; bookmark: { title: string; url: string } }) => api.bookmarks.add(channelId, bookmark) })
}

export function useUpdateBookmark() {
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: { title?: string; url?: string } }) => api.bookmarks.update(id, patch) })
}

export function useRemoveBookmark() {
  return useMutation({ mutationFn: (id: string) => api.bookmarks.remove(id) })
}
