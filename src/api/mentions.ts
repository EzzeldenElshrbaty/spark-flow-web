import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/**
 * Mentions of me, for the bell and Home. Live events refresh it; a slow poll stands in for a server push, quietly
 * (no top loading bar).
 */
export function useMyMentions(enabled = true) {
  return useQuery({ queryKey: qk.mentions(), queryFn: () => api.mentions.mine(), retry, enabled, refetchInterval: 120_000, meta: { silent: true } })
}
export function useMarkMentionsRead() {
  return useMutation({ mutationFn: (ids: string[]) => api.mentions.markRead(ids) })
}
