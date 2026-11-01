import { useMutation, useQuery } from '@tanstack/react-query'
import type { NewManualEntry, ReportPeriod, TimeEntryPatch, TimeTarget } from '@/api/types'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'
import { currentLocation } from '@/lib/geo'

/** My day: today's check-in, my running timer and today's entries. Live events from other tabs refresh it. */
export function useMyDay() {
  return useQuery({ queryKey: qk.myDay(), queryFn: () => api.time.today(), retry })
}

/** Checks in with the browser's place (or why there's none); the server adds the time, IP and device. */
export function useCheckIn() {
  return useMutation({ mutationFn: async (input: { plan: string; target?: TimeTarget }) => api.time.checkIn({ ...input, location: await currentLocation() }) })
}
export function useCheckOut() {
  return useMutation({ mutationFn: async () => api.time.checkOut({ location: await currentLocation() }) })
}
export function useUndoCheckOut() {
  return useMutation({ mutationFn: () => api.time.undoCheckOut() })
}
export function useStartTimer() {
  return useMutation({ mutationFn: (target: TimeTarget) => api.time.start(target) })
}
export function useStopTimer() {
  return useMutation({ mutationFn: () => api.time.stop() })
}
export function useAddTime() {
  return useMutation({ mutationFn: (entry: NewManualEntry) => api.time.addManual(entry) })
}
export function useUpdateTime() {
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: TimeEntryPatch }) => api.time.update(id, patch) })
}
export function useRemoveTime() {
  return useMutation({ mutationFn: (id: string) => api.time.remove(id) })
}

/** The Time & cost report; only asked for by people who may see it. */
export function useTimeReport(workspaceId: string | undefined, days: ReportPeriod, enabled: boolean, projectId?: string) {
  return useQuery({
    queryKey: qk.timeReport(workspaceId ?? '', days, projectId),
    queryFn: () => api.time.report(workspaceId!, days, projectId ? { projectId } : undefined),
    retry,
    enabled: enabled && Boolean(workspaceId),
  })
}
