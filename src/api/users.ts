import { useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

export function useMe() {
  return useQuery({ queryKey: qk.me(), queryFn: () => api.users.me(), retry })
}

/** A workspace's people. Pass undefined while the workspace is unknown: nothing is requested until there is an id. */
export function useUsers(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.users(workspaceId ?? ''), queryFn: () => api.users.list(workspaceId!), retry, enabled: Boolean(workspaceId) })
}
