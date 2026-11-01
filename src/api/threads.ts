import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { api } from '@/lib/api'

/** Threads I follow in a workspace (spec 6.12), unread first, 20 a page; live through replies, edits and reads. */
export function useThreads(workspaceId: string | undefined) {
  return useInfiniteQuery({
    queryKey: qk.threads(workspaceId ?? ''),
    queryFn: ({ pageParam }) => api.threads.list(workspaceId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(workspaceId),
  })
}

/** Reads these threads' replies (Activity and the bell too). */
export function useMarkThreadsRead() {
  return useMutation({ mutationFn: ({ workspaceId, rootIds }: { workspaceId: string; rootIds: string[] }) => api.threads.markRead(workspaceId, rootIds) })
}
