import { useMutation, useQuery } from '@tanstack/react-query'
import type { NewTicket, TicketPatch } from '@/api/types'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

// Every hook below takes an id that may still be unknown (a route param, a lookup in progress): without one it
// asks for nothing instead of firing a request for ''.
export function useProjects(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.projects(workspaceId ?? ''), queryFn: () => api.tickets.projects(workspaceId!), retry, enabled: Boolean(workspaceId) })
}

/** One project by its key (such as NEX), from its workspace's list; null when there is no such project. */
export function useProject(workspaceId: string | undefined, key: string | undefined) {
  return useQuery({
    queryKey: qk.projects(workspaceId ?? ''),
    queryFn: () => api.tickets.projects(workspaceId!),
    retry,
    enabled: Boolean(workspaceId && key),
    select: (projects) => projects.find((p) => p.key === key) ?? null,
  })
}

export function useSprints(projectId: string | undefined) {
  return useQuery({ queryKey: qk.sprints(projectId ?? ''), queryFn: () => api.tickets.sprints(projectId!), retry, enabled: Boolean(projectId) })
}

export function useTickets(projectId: string | undefined) {
  return useQuery({ queryKey: qk.tickets(projectId ?? ''), queryFn: () => api.tickets.list(projectId!), retry, enabled: Boolean(projectId) })
}

export function useTicket(key: string | undefined) {
  return useQuery({ queryKey: qk.ticket(key ?? ''), queryFn: () => api.tickets.get(key!), retry, enabled: Boolean(key) })
}

export function useCreateTask() {
  return useMutation({ mutationFn: (input: NewTicket) => api.tasks.create(input) })
}

export function useUpdateTask() {
  return useMutation({ mutationFn: ({ key, patch }: { key: string; patch: TicketPatch }) => api.tasks.update(key, patch) })
}
