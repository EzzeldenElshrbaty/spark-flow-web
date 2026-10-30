import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/** The workspace's file folders, by name (spec 6.9 Add to folder). */
export function useFolders(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.folders(workspaceId ?? ''), queryFn: () => api.folders.list(workspaceId!), retry, enabled: Boolean(workspaceId) })
}

/** New folder… */
export function useCreateFolder() {
  return useMutation({ mutationFn: ({ workspaceId, name }: { workspaceId: string; name: string }) => api.folders.create(workspaceId, name) })
}
