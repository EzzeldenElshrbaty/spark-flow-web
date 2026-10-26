import { useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/** The dashboard's projects; only asked for once the viewer may see the dashboard. */
export function useDashboard(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: qk.dashboard(workspaceId ?? ''), queryFn: () => api.dashboard.projects(workspaceId!), retry, enabled: enabled && Boolean(workspaceId) })
}
export function useCheckedIn(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: qk.checkedIn(workspaceId ?? ''), queryFn: () => api.dashboard.checkedIn(workspaceId!), retry, enabled: enabled && Boolean(workspaceId) })
}
