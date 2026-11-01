import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { Role, RoleChange } from '@/api/types'
import { api } from '@/lib/api'

/** Every role, with what it grants and how many hold it (slice 1). */
export function useRoles() {
  return useQuery({ queryKey: qk.roles(), queryFn: () => api.roles.list(), retry })
}

/** The roles' names in their order, for showing what someone holds ("Admin, Sales"): "" while unknown, "—" for none. */
export function useRoleNames() {
  const roles = useRoles().data
  return useCallback((ids: readonly string[]) => (roles ? roles.filter((r) => ids.includes(r.id)).map((r) => r.name).join(', ') || '—' : ''), [roles])
}

export function useCreateRole() {
  return useMutation({ mutationFn: (input: { name: string; copyFrom?: string | null }) => api.roles.create(input) })
}

export function useRenameRole() {
  return useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => api.roles.rename(id, name) })
}

export function useDeleteRole() {
  return useMutation({ mutationFn: (id: string) => api.roles.remove(id) })
}

/** Saves every changed role's permissions in one go (Save changes). */
export function useSaveGrants() {
  return useMutation({ mutationFn: (changes: RoleChange[]) => api.roles.saveGrants(changes) })
}

export type { Role }
