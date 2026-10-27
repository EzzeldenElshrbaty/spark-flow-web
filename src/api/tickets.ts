import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import type { NewTicket, TicketPatch } from '@/api/types'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

// Every hook below takes an id that may still be unknown (a route param, a lookup in progress): without one it
// asks for nothing instead of firing a request for ''.
export function useProjects(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.projects(workspaceId ?? ''), queryFn: () => api.projects.list(workspaceId!), retry, enabled: Boolean(workspaceId) })
}

/** One project by its key (such as NEX), from its workspace's list; null when there is no such project. */

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

export function useArchivedTasks(projectId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: qk.archivedTickets(projectId ?? ''), queryFn: () => api.tickets.list(projectId!, { archived: true }), retry, enabled: enabled && Boolean(projectId) })
}
export function useArchiveTask() {
  return useMutation({ mutationFn: (key: string) => api.tasks.archive(key) })
}
export function useRestoreTask() {
  return useMutation({ mutationFn: (key: string) => api.tasks.restore(key) })
}
export function useUpdateTask() {
  return useMutation({ mutationFn: ({ key, patch }: { key: string; patch: TicketPatch }) => api.tasks.update(key, patch) })
}
export function useMoveTask() {
  return useMutation({ mutationFn: ({ key, status, index, visibleKeys }: { key: string; status: string; index: number; visibleKeys?: string[] }) => api.tasks.moveTo(key, status, index, visibleKeys) })
}

/** Every task of several projects (one query each, shared with each project's Tasks tab). */
/** The archived tasks of several projects (their time rows still name them). */
export function useArchivedTasksOf(projectIds: string[]) {
  return useQueries({
    queries: projectIds.map((id) => ({ queryKey: qk.archivedTickets(id), queryFn: () => api.tickets.list(id, { archived: true }), retry })),
    combine: (results) => results.flatMap((r) => r.data ?? []),
  })
}

/** The keys of the archived tasks of several projects (for chips: an old @NEX-101 still links). */
export function useArchivedKeysOf(projectIds: string[]) {
  return useQueries({
    queries: projectIds.map((id) => ({ queryKey: qk.archivedTickets(id), queryFn: () => api.tickets.list(id, { archived: true }), retry })),
    combine: (results) => results.flatMap((r) => (r.data ?? []).map((t) => t.key)),
  })
}

export function useTasksOf(projectIds: string[]) {
  return useQueries({
    queries: projectIds.map((id) => ({ queryKey: qk.tickets(id), queryFn: () => api.tickets.list(id), retry })),
    combine: (results) => ({
      data: results.flatMap((r) => r.data ?? []),
      isPending: results.some((r) => r.isPending),
      isError: results.some((r) => r.isError),
      refetch: () => results.forEach((r) => void r.refetch()),
    }),
  })
}

/** The tasks behind these keys, for chips and unfurls (spec 6.3); a status change anywhere refreshes them. */
export function useTaskRefs(keys: string[]) {
  const sorted = [...new Set(keys)].sort()
  return useQuery({ queryKey: qk.taskRefs(sorted), queryFn: () => api.tickets.resolve(sorted), enabled: sorted.length > 0, placeholderData: (previous) => previous })
}
