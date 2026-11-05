import { useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { AttendanceQuery } from '@/api/types'
import { api } from '@/lib/api'

// User attendance and activities (Admin and help, slice 5). App time grows while people use Flow and sends no event,
// so the views that show it look again once a minute.

const APP_TIME_MS = 60_000

/** Whose attendance I may see, me first. */
export function useAttendanceScope() {
  return useQuery({ queryKey: qk.attendance('scope'), queryFn: () => api.attendance.scope(), retry })
}

export function useCheckEvents(query: AttendanceQuery, enabled = true) {
  return useQuery({ queryKey: qk.attendance('checkIns', query.days, query.userId ?? ''), queryFn: () => api.attendance.checkIns(query), retry, enabled })
}

export function useAttendanceDay(day: string, userId: string | undefined, enabled = true) {
  return useQuery({ queryKey: qk.attendance('day', day, userId ?? ''), queryFn: () => api.attendance.day(day, userId), retry, enabled, refetchInterval: APP_TIME_MS })
}

export function useVisits(query: AttendanceQuery, enabled = true) {
  return useQuery({ queryKey: qk.attendance('visits', query.days, query.userId ?? ''), queryFn: () => api.attendance.visits(query), retry, enabled, refetchInterval: APP_TIME_MS })
}

export function useAttendanceReport(query: AttendanceQuery, enabled = true) {
  return useQuery({ queryKey: qk.attendance('report', query.days, query.userId ?? ''), queryFn: () => api.attendance.report(query), retry, enabled, refetchInterval: APP_TIME_MS })
}

export function useWorkHours() {
  return useQuery({ queryKey: qk.attendance('workHours'), queryFn: () => api.attendance.workHours(), retry })
}

/** The timer timeout (timer slice 2). */
export function useTimerSetting() {
  return useQuery({ queryKey: qk.attendance('timer'), queryFn: () => api.attendance.timer(), retry })
}

export function useSetTimerSetting() {
  return useMutation({ mutationFn: (timeoutHours: number) => api.attendance.setTimer({ timeoutHours }) })
}

export function useSetWorkHours() {
  return useMutation({ mutationFn: (input: { days: number[]; start: string; end: string }) => api.attendance.setWorkHours(input) })
}

/** One report of app use (layout/ActivityTracker); losing one is harmless, the next carries on the same visit. */
export const pingActivity = () => api.attendance.ping()
