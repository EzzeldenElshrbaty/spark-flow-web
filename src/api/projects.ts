import { useMutation, useQuery } from '@tanstack/react-query'
import type { BoardColumn, DeliverablePatch, NewDeliverable, NewPhase, NewProject, PhasePatch, ProjectPatch, StatusCategory, UploadFile } from '@/api/types'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api, ApiError } from '@/lib/api'

// Like every hook file: no id, no request. Writes are plain mutations; main.tsx reloads every query after each one.

export function useProjectSummaries(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.projects(workspaceId ?? ''), queryFn: () => api.projects.list(workspaceId!), retry, enabled: Boolean(workspaceId) })
}

/** One project's summary, from its workspace's list; null when there is no such key. */
/** One project by its key, archived or not (the list leaves archived ones out); null when there's none. */
export function useProjectSummary(workspaceId: string | undefined, key: string | undefined) {
  return useQuery({
    queryKey: qk.projectByKey(workspaceId ?? '', key ?? ''),
    queryFn: () => api.projects.get(workspaceId!, key!).catch((error: unknown) => (error instanceof ApiError && error.status === 404 ? null : Promise.reject(error))),
    retry,
    enabled: Boolean(workspaceId && key),
  })
}

/** The workspace's archived projects (Projects → Show archived). */
export function useArchivedProjects(workspaceId: string | undefined, enabled: boolean) {
  return useQuery({ queryKey: qk.archivedProjects(workspaceId ?? ''), queryFn: () => api.projects.list(workspaceId!, { archived: true }), retry, enabled: Boolean(workspaceId) && enabled })
}
export function useArchiveProject() {
  return useMutation({ mutationFn: (id: string) => api.projects.archive(id) })
}
export function useRestoreProject() {
  return useMutation({ mutationFn: (id: string) => api.projects.restore(id) })
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
export function useRemoveDeliverable() {
  return useMutation({ mutationFn: (id: string) => api.deliverables.remove(id) })
}

export function useTeams(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.teams(workspaceId ?? ''), queryFn: () => api.teams.list(workspaceId!), retry, enabled: Boolean(workspaceId) })
}

export function useProjectFiles(projectId: string | undefined) {
  return useQuery({ queryKey: qk.files(projectId ?? ''), queryFn: () => api.files.list(projectId!), retry, enabled: Boolean(projectId) })
}
export function useUploadFile() {
  return useMutation({
    mutationFn: ({ projectId, file, signal }: { projectId: string; file: UploadFile; signal?: AbortSignal }) => api.files.upload(projectId, file, signal),
  })
}
export function useRemoveFile() {
  return useMutation({ mutationFn: (id: string) => api.files.remove(id) })
}

/** A blob: address for a stored file, to show it; the caller revokes it (URL.revokeObjectURL) when done. Not a query: it isn't cached. */
export const openFile = (id: string) => api.files.url(id)

export function useProjectTime(projectId: string | undefined) {
  return useQuery({ queryKey: qk.time(projectId ?? ''), queryFn: () => api.time.list(projectId!), retry, enabled: Boolean(projectId) })
}
