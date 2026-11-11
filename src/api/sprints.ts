import { useMutation } from '@tanstack/react-query'
import type { NewSprint, SprintPatch, StartSprint } from '@/api/types'
import { api } from '@/lib/api'

// A project's sprint writes (sprints spec §5); `useSprints` reads them, from tickets.ts with its query key. Every
// mutation reloads every query (main.tsx).

export function useCreateSprint() {
  return useMutation({ mutationFn: (input: NewSprint) => api.sprints.create(input) })
}
export function useUpdateSprint() {
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: SprintPatch }) => api.sprints.update(id, patch) })
}
export function useStartSprint() {
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: StartSprint }) => api.sprints.start(id, input) })
}
/** `moveTo`: a planned sprint's id, `'new'` (a sprint made with the defaults), or null (the backlog). */
export function useCompleteSprint() {
  return useMutation({ mutationFn: ({ id, moveTo }: { id: string; moveTo: string | 'new' | null }) => api.sprints.complete(id, { moveTo }) })
}
export function useRemoveSprint() {
  return useMutation({ mutationFn: (id: string) => api.sprints.remove(id) })
}
