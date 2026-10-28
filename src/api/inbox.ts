import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/**
 * My Activity in a workspace (spec 6.12): mentions, reactions to my messages and replies in threads I follow, newest
 * first. Live events refresh it; a slow poll stands in for a server push, quietly (no top loading bar).
 */
export function useActivity(workspaceId: string | undefined) {
  return useQuery({
    queryKey: qk.activity(workspaceId ?? ''),
    queryFn: () => api.inbox.list(workspaceId!),
    retry,
    enabled: Boolean(workspaceId),
    refetchInterval: 120_000,
    meta: { silent: true },
  })
}

/** Marks these items read, or with no ids all of the workspace's Activity (Mark all read). */
export function useMarkActivityRead() {
  return useMutation({ mutationFn: ({ workspaceId, ids }: { workspaceId: string; ids?: string[] }) => api.inbox.markRead(workspaceId, ids) })
}
