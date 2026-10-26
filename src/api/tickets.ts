import { useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

export function useProjects(workspaceId: string) {
  return useQuery({ queryKey: qk.projects(workspaceId), queryFn: () => api.tickets.projects(workspaceId), retry })
}

/** One project by its key (such as NEX), from its workspace's list; null when there is no such project. */
export function useProject(workspaceId: string, key: string) {
  return useQuery({
    queryKey: qk.projects(workspaceId),
    queryFn: () => api.tickets.projects(workspaceId),
    retry,
    select: (projects) => projects.find((p) => p.key === key) ?? null,
  })
}

export function useSprints(projectId: string) {
  return useQuery({ queryKey: qk.sprints(projectId), queryFn: () => api.tickets.sprints(projectId), retry })
}

export function useTickets(projectId: string) {
  return useQuery({ queryKey: qk.tickets(projectId), queryFn: () => api.tickets.list(projectId), retry })
}

export function useTicket(key: string) {
  return useQuery({ queryKey: qk.ticket(key), queryFn: () => api.tickets.get(key), retry })
}
