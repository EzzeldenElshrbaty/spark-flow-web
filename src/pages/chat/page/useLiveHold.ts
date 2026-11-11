import { useEffect, useReducer, useState } from 'react'
import type { PageHold } from '@/api/types'
import { PAGE_HOLD_MS } from '@/lib/pageBody'

/**
 * Who holds the page, as a reader hears it (polish pass). The server reports only a live hold, and each renewal is
 * news (`pageEditing`), so a hold is live for 60 s from when the page that first carried this `until` arrived
 * (`receivedAt`, the query's `dataUpdatedAt`: a cached page keeps its own time, final review), whatever my clock says
 * of `until` itself. Re-renders when it runs out, so "… is editing" goes by itself.
 */
export function useLiveHold(hold: PageHold | null | undefined, receivedAt: number): PageHold | null {
  const until = hold?.until ?? null
  const [heard, setHeard] = useState(() => ({ until, at: receivedAt }))
  // A new `until` is news: the 60 s start from when it arrived (state from props, set while rendering). The same one
  // fetched again isn't.
  if (heard.until !== until) setHeard({ until, at: receivedAt })
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const ends = heard.at + PAGE_HOLD_MS
  useEffect(() => {
    if (!until) return
    const ms = ends - Date.now()
    if (ms <= 0) return
    const timer = setTimeout(tick, ms + 50)
    return () => clearTimeout(timer)
  }, [until, ends])
  return hold && Date.now() < ends ? hold : null
}
