import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { ChatTarget, SavedStatus } from '@/api/types'
import { api } from '@/lib/api'

/** My saved messages and replies in a workspace (spec 6.12 Saved), reminders first. Live events refresh it. */
export function useSaved(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.saved(workspaceId ?? ''), queryFn: () => api.saved.list(workspaceId!), retry, enabled: Boolean(workspaceId), meta: { silent: true } })
}

/** Save for later (S), or Remind me with a time: the same item (spec 6.4, 6.5). */
export function useSave() {
  return useMutation({ mutationFn: ({ target, remindAt }: { target: ChatTarget; remindAt?: string }) => api.saved.save(target, remindAt) })
}

/** Complete, archive, bring back, or change the reminder (a new time, or null for none). */
export function useUpdateSaved() {
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string; status?: SavedStatus; remindAt?: string | null }) => api.saved.update(id, patch) })
}

/** Takes it out of Saved. */
export function useRemoveSaved() {
  return useMutation({ mutationFn: (id: string) => api.saved.remove(id) })
}
