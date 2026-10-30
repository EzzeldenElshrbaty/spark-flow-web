import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import type { SearchRequest } from '@/api/types'
import { api } from '@/lib/api'

/**
 * One search (spec 6.12): its tab's results page by page (Messages by 20; the others come whole) and every tab's
 * count. Off while `request` is null. The last results stay on screen while a new search loads.
 */
export function useSearch(workspaceId: string | undefined, request: Omit<SearchRequest, 'cursor'> | null) {
  return useInfiniteQuery({
    queryKey: qk.search(workspaceId ?? '', request),
    queryFn: ({ pageParam }) => api.search.run(workspaceId!, { ...request!, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: Boolean(workspaceId && request),
    placeholderData: keepPreviousData,
  })
}
