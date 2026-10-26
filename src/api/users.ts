import { useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

export function useMe() {
  return useQuery({ queryKey: qk.me(), queryFn: () => api.users.me(), retry })
}

export function useUsers(workspaceId: string) {
  return useQuery({ queryKey: qk.users(workspaceId), queryFn: () => api.users.list(workspaceId), retry })
}
