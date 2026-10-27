import { useMutation, useQuery } from '@tanstack/react-query'
import type { BoardColumn, DeliverablePatch, NewDeliverable, NewPhase, NewProject, PhasePatch, ProjectPatch, StatusCategory, UploadFile } from '@/api/types'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

// Like every hook file: no id, no request. Writes are plain mutations; main.tsx reloads every query after each one.

export function useProjectSummaries(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.projects(workspaceId ?? ''), queryFn: () => api.projects.list(workspaceId!), retry, enabled: Boolean(workspaceId) })
}

/** One project's summary, from its workspace's list; null when there is no such key. */
export function useProjectSummary(workspaceId: string | undefined, key: string | undefined) {
  return useQuery({
    queryKey: qk.projects(workspaceId ?? ''),
    queryFn: () => api.projects.list(workspaceId!),
    retry,
    enabled: Boolean(workspaceId && key),
    select: (projects) => projects.find((p) => p.key === key) ?? null,
  })
}

export function useCreateProject() {
  return useMutation({ mutationFn: (input: NewProject) => api.projects.create(input) })
}
export function useAddColumn() {
  return useMutation({ mutationFn: ({ projectId, input }: { projectId: string; input: { label: string; category: StatusCategory; after?: string } }) => api.projects.addColumn(projectId, input) })
}
export function useDeleteColumn() {
  return useMutation({ mutationFn: ({ projectId, columnId, moveTo }: { projectId: string; columnId: string; moveTo: string }) => api.projects.deleteColumn(projectId, columnId, moveTo) })
}
export function useSetBoard() {
  return useMutation({ mutationFn: ({ id, columns }: { id: string; columns: BoardColumn[] }) => api.projects.setBoard(id, columns) })
}
export function useUpdateProject() {
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: ProjectPatch }) => api.projects.update(id, patch) })
}

export function usePhases(projectId: string | undefined) {
  return useQuery({ queryKey: qk.phases(projectId ?? ''), queryFn: () => api.phases.list(projectId!), retry, enabled: Boolean(projectId) })
}
export function useCreatePhase() {
  return useMutation({ mutationFn: (input: NewPhase) => api.phases.create(input) })
}
export function useUpdatePhase() {
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: PhasePatch }) => api.phases.update(id, patch) })
}
export function useRemovePhase() {
  return useMutation({ mutationFn: (id: string) => api.phases.remove(id) })
}
export function useReorderPhases() {
  return useMutation({ mutationFn: ({ projectId, ids }: { projectId: string; ids: string[] }) => api.phases.reorder(projectId, ids) })
}

export function useDeliverables(projectId: string | undefined) {
  return useQuery({ queryKey: qk.deliverables(projectId ?? ''), queryFn: () => api.deliverables.list(projectId!), retry, enabled: Boolean(projectId) })
}
export function useCreateDeliverable() {
  return useMutation({ mutationFn: (input: NewDeliverable) => api.deliverables.create(input) })
}
export function useUpdateDeliverable() {
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: DeliverablePatch }) => api.deliverables.update(id, patch) })
}

export function useTeams(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.teams(workspaceId ?? ''), queryFn: () => api.teams.list(workspaceId!), retry, enabled: Boolean(workspaceId) })
}

export function useProjectFiles(projectId: string | undefined) {
  return useQuery({ queryKey: qk.files(projectId ?? ''), queryFn: () => api.files.list(projectId!), retry, enabled: Boolean(projectId) })
}
export function useUploadFile() {
  return useMutation({ mutationFn: ({ projectId, file }: { projectId: string; file: UploadFile }) => api.files.upload(projectId, file) })
}

/** A blob: address for a stored file, to show it; the caller revokes it (URL.revokeObjectURL) when done. Not a query: it isn't cached. */
export const openFile = (id: string) => api.files.url(id)

export function useProjectTime(projectId: string | undefined) {
  return useQuery({ queryKey: qk.time(projectId ?? ''), queryFn: () => api.time.list(projectId!), retry, enabled: Boolean(projectId) })
}
