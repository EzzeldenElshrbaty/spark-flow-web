import { useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/** The dashboard's projects; only asked for once the viewer may see the dashboard. */
export function useDashboard(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: qk.dashboard(workspaceId ?? ''), queryFn: () => api.dashboard.projects(workspaceId!), retry, enabled: enabled && Boolean(workspaceId) })
}
/** Who has a timer running on the dashboard's projects (timer slice 3). */
export function useWorkingNow(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: qk.workingNow(workspaceId ?? ''), queryFn: () => api.dashboard.workingNow(workspaceId!), retry, enabled: enabled && Boolean(workspaceId) })
}
