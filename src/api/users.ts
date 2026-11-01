import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { NewPerson, PersonPatch, PersonRow, User } from '@/api/types'
import { api } from '@/lib/api'

/** Who I am, for the hook and for reads outside render (desktop notifications). */
export const meQuery = () => queryOptions({ queryKey: qk.me(), queryFn: () => api.users.me(), retry })
export const usersQuery = (workspaceId: string) => queryOptions({ queryKey: qk.users(workspaceId), queryFn: () => api.users.list(workspaceId), retry })

export function useMe() {
  return useQuery(meQuery())
}

/** A workspace's people. Pass undefined while the workspace is unknown: nothing is requested until there is an id. */
export function useUsers(workspaceId: string | undefined) {
  return useQuery({ ...usersQuery(workspaceId ?? ''), enabled: Boolean(workspaceId) })
}

/** Demo only: act as another seeded person. The caller clears the query cache afterwards. */
export function useViewAs() {
  return useMutation({ mutationFn: (userId: string) => api.users.viewAs(userId), meta: { closeFirst: true } })
}

/** Settings → Users (slice 3): everyone, active or not, with when each last did anything. */
export function useDirectory(enabled = true) {
  return useQuery({ queryKey: qk.people(), queryFn: () => api.users.directory(), retry, enabled })
}

export function useCreatePerson() {
  return useMutation({ mutationFn: (input: NewPerson) => api.users.create(input) })
}

export function useUpdatePerson() {
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: PersonPatch }) => api.users.update(id, patch) })
}

export function useDeactivatePerson() {
  return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.users.deactivate(id, reason) })
}

export function useReactivatePerson() {
  return useMutation({ mutationFn: (id: string) => api.users.reactivate(id) })
}

export type { PersonRow, User }
