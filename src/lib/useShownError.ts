import { useState } from 'react'

type QueryState = { error: Error | null; hasData: boolean; fetching: boolean }

/** The error a page shows for a query: its own, or while a retry with no data runs, the last one (see below). */
export function shownError({ error, hasData, fetching }: QueryState, last: Error | null): Error | null {
  if (hasData) return null
  return error ?? (fetching ? last : null)
}

/**
 * A query's error that lasts through Try again. TanStack Query clears `error` when it refetches a query with no data,
 * so without this a failed state flips back to its skeleton (or the page behind it) for as long as the retry runs.
 */
export function useShownError(query: { data: unknown; error: unknown; isFetching: boolean }): Error | null {
  const [last, setLast] = useState<Error | null>(null)
  const error = (query.error as Error | null) ?? null
  const hasData = query.data !== undefined
  // Only while there's no data to show: an error over cached data (a 401 after signing out) set it then cleared it
  // again on every render, forever (slice AB).
  if (error && error !== last && !hasData) setLast(error)
  if (hasData && last) setLast(null)
  return shownError({ error, hasData, fetching: query.isFetching }, last)
}
