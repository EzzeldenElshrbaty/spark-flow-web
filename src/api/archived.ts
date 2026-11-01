import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { ArchivedType } from '@/api/types'
import { api } from '@/lib/api'

// Archived records (Admin and help, slice 4). Restoring uses each type's own hook (useRestoreProject…).

/** What's archived in a workspace, and how many days records are kept. */
export function useArchived(workspaceId: string | undefined, enabled = true) {
  return useQuery({ queryKey: qk.archive(workspaceId ?? ''), queryFn: () => api.archive.list(workspaceId!), retry, enabled: enabled && Boolean(workspaceId) })
}

export function useSetRetention() {
  return useMutation({ mutationFn: (days: number) => api.archive.setRetention(days) })
}

export function useDeleteForGood() {
  return useMutation({ mutationFn: ({ type, id }: { type: ArchivedType; id: string }) => api.archive.deleteForGood(type, id) })
}
