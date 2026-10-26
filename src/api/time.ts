import { useMutation, useQuery } from '@tanstack/react-query'
import type { NewManualEntry, TimeTarget } from '@/api/types'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import { api } from '@/lib/api'

/** My day: today's check-in, my running timer and today's entries. Live events from other tabs refresh it. */
export function useMyDay() {
  return useQuery({ queryKey: qk.myDay(), queryFn: () => api.time.today(), retry })
}

export function useCheckIn() {
  return useMutation({ mutationFn: (input: { plan: string; target?: TimeTarget }) => api.time.checkIn(input) })
}
export function useCheckOut() {
  return useMutation({ mutationFn: () => api.time.checkOut() })
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
