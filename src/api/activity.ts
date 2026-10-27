import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/** A task's history, newest first. */
export function useTaskHistory(key: string | undefined, enabled = true) {
  return useQuery({ queryKey: qk.taskHistory(key ?? ''), queryFn: () => api.activity.forTask(key!), retry, enabled: enabled && Boolean(key) })
}

/** A project's history, newest first, 30 at a time ("Load older"). */
export function useProjectHistory(projectId: string | undefined) {
  return useInfiniteQuery({
    queryKey: qk.projectHistory(projectId ?? ''),
    queryFn: ({ pageParam }) => api.activity.forProject(projectId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry,
    enabled: Boolean(projectId),
  })
}
