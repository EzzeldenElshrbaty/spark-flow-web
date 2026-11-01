import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import { retryUnlessNotFound as retry } from '@/api/retry'
import type { AuditFilter } from '@/api/types'
import { api } from '@/lib/api'

// The audit log (Admin and help, slice 2). Only people with "See the audit log" read it; the page asks only then.

/** The log, newest first, 50 at a time (Show more); a new filter keeps the old rows on screen until it arrives. */
export function useAuditLog(filter: AuditFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: qk.auditList(filter),
    queryFn: ({ pageParam }) => api.audit.list(filter, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    retry,
    enabled,
  })
}

/** Today's counts (from `todayFrom`, the start of my day), what needs a look, the tamper check and the filters' choices. */
export function useAuditSummary(todayFrom: string, enabled = true) {
  return useQuery({ queryKey: qk.auditSummary(todayFrom), queryFn: () => api.audit.summary(todayFrom), retry, enabled })
}

/** One entry by its number (a link to #341, a Needs a look line). */
export function useAuditEntry(seq: number | null, enabled = true) {
  return useQuery({ queryKey: qk.auditEntry(seq ?? 0), queryFn: () => api.audit.get(seq!), retry, enabled: enabled && seq !== null })
}

/** The filtered log as CSV text; taking it is recorded, so the page's queries refresh after. */
export function useExportAudit() {
  return useMutation({ mutationFn: (filter: AuditFilter) => api.audit.export(filter) })
}

/**
 * Tells the log a file was downloaded. Fire and forget: the download itself never waits for it or fails with it, and
 * file cards stay free of queries.
 */
export function noteDownload(fileId: string): void {
  api.audit.noteDownload(fileId).catch(() => undefined)
}

/** Tells the log the Time and cost CSV was exported, with what it held ("30 days · By project · All projects"). */
export function noteExport(what: 'timeCost', detail: string): void {
  api.audit.noteExport(what, detail).catch(() => undefined)
}
