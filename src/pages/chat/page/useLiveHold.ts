import { useEffect, useReducer, useState } from 'react'
import type { PageHold } from '@/api/types'
import { PAGE_HOLD_MS } from '@/lib/pageBody'

/**
 * Who holds the page, as a reader hears it (polish pass). The server reports only a live hold, and each renewal is
 * news (`pageEditing`), so a hold is live when it arrives and for 60 s after I last heard of it, whatever my own clock
 * says of its `until`. Re-renders when it runs out, so "… is editing" goes by itself.
 */
export function useLiveHold(hold: PageHold | null | undefined): PageHold | null {
  const until = hold?.until ?? null
  const [heard, setHeard] = useState(() => ({ until, at: Date.now() }))
  // A new `until` is news: the 60 s start again (state from props, set while rendering).
  if (heard.until !== until) setHeard({ until, at: Date.now() })
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
