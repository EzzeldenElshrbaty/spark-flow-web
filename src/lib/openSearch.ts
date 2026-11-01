import { useEffect, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { paths } from '@/lib/paths'

/** Navigation state that puts the caret in the search box, after the query (the channel's 🔍, ⌘F, /search). */
export type SearchNavState = { focus?: 'search' } | null

/** Opens Search for `q`, the caret in the box. */
export function useOpenSearch(workspaceSlug: string) {
  const navigate = useNavigate()
  return (q: string) => navigate(paths.search(workspaceSlug, q), { state: { focus: 'search' } satisfies SearchNavState })
}

/**
 * A search box that takes the caret on arriving with `focus: 'search'`, when it is the one on screen (the top bar's
 * from tablets up, the view's own on phones). Once per arrival: the state is cleared, so Back or Forward to the same
 * entry doesn't take focus again.
 */
export function useFocusOnArrival(box: RefObject<HTMLInputElement | null>) {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const el = box.current
    if ((location.state as SearchNavState)?.focus !== 'search' || !el || el.getClientRects().length === 0) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null })
    // Only on a new arrival, not each time something else changes the location object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])
}
