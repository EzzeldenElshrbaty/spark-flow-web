import { useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

export function useWorkspaces() {
  return useQuery({ queryKey: qk.workspaces(), queryFn: () => api.workspaces.list(), retry })
}

/** One workspace by its slug, from the same list; null when there is no such workspace. */
export function useWorkspace(slug: string) {
  return useQuery({
    queryKey: qk.workspaces(),
    queryFn: () => api.workspaces.list(),
    retry,
    select: (workspaces) => workspaces.find((w) => w.slug === slug) ?? null,
  })
}
