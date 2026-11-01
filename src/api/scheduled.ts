import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { Api } from '@/api/types'
import type { Body } from '@/lib/messageBody'
import { api } from '@/lib/api'

/** My scheduled messages in a workspace (spec 6.12 Drafts & sent: Scheduled), soonest first. Live events refresh it. */
export function useScheduled(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.scheduled(workspaceId ?? ''), queryFn: () => api.scheduled.list(workspaceId!), retry, enabled: Boolean(workspaceId), meta: { silent: true } })
}

/** What I sent in a workspace (spec 6.12 Sent), newest first. */
export function useSent(workspaceId: string | undefined) {
  return useQuery({ queryKey: qk.sent(workspaceId ?? ''), queryFn: () => api.chat.sent(workspaceId!), retry, enabled: Boolean(workspaceId), meta: { silent: true } })
}

/** Schedule message (spec 6.8): to a channel, or with `rootId` into a thread, in the viewer's time zone. */
export function useSchedule() {
  return useMutation({ mutationFn: (input: Parameters<Api['scheduled']['create']>[0]) => api.scheduled.create(input) })
}

/** Reschedule, or edit the text. */
export function useUpdateScheduled() {
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string; sendAt?: string; body?: Body }) => api.scheduled.update(id, patch) })
}

export function useRemoveScheduled() {
  return useMutation({ mutationFn: (id: string) => api.scheduled.remove(id) })
}

export function useSendScheduledNow() {
  return useMutation({ mutationFn: (id: string) => api.scheduled.sendNow(id) })
}

/** The viewer's time zone, which scheduled times are in ("Times are in Africa/Cairo."). */
export const viewerZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
