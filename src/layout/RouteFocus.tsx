import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { focusPageHeading } from '@/lib/pageFocus'

/** How long to wait for a page's heading, while its data loads. */
const WAIT_MS = 5000

/** Focus is in the page itself (a tab, a field, a composer that focused itself), not left behind elsewhere. */
function focusInPage(main: HTMLElement | null): boolean {
  const active = document.activeElement
  // <main> itself (where Skip to content leaves focus) is the page's frame, not a place in it (UX Phase 6).
  return Boolean(main && active && active !== document.body && active !== main && active.isConnected && main.contains(active))
}

/** A field someone is typing in (the top bar's search): never taken from them. */
function typingIn(el: Element | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || el.matches('input, textarea, select'))
}

/**
 * After a move to another page, focus goes to the new page's heading when it was left in the sidebar, top bar, bottom
 * bar or drawer, or was lost; a screen reader then reads where you are (UX Phase 5A, 5.7). Left alone: the page load
 * (and Back into the app), focus already in the page, a field someone is typing in, a page sent with the caret for
 * somewhere else (the search box, `state.focus`), and focus a person moves while a late heading is on its way. Signing in is a move into the app, so it
 * counts. Mounted before the top bar, so a place that takes the caret on arrival does so after this (final review).
 */
export function RouteFocus() {
  const location = useLocation()
  const { pathname } = location
  const sentElsewhere = Boolean((location.state as { focus?: string } | null)?.focus)
  const navigationType = useNavigationType()
  // The path focus was last settled for: a page load's (POP) settles itself, StrictMode's second run included.
  const settled = useRef<string | null>(navigationType === 'POP' ? pathname : null)
  useEffect(() => {
    if (settled.current === pathname) return
    settled.current = pathname
    if (sentElsewhere) return
    const main = document.getElementById('main')
    const start = document.activeElement
    if (typingIn(start)) return
    // Focus a person moved since the move began (into the top bar's search, the sidebar, a panel) stays.
    const movedOn = () => {
      const active = document.activeElement
      return active !== start && active !== document.body && Boolean(active?.isConnected)
    }
    if (focusInPage(main) || focusPageHeading() || !main) return
    const observer = new MutationObserver(() => {
      if (focusInPage(main) || movedOn() || focusPageHeading()) stop()
    })
    const timer = setTimeout(() => stop(), WAIT_MS)
    const stop = () => {
      observer.disconnect()
      clearTimeout(timer)
    }
    observer.observe(main, { childList: true, subtree: true })
    return stop
  }, [pathname, sentElsewhere])
  return null
}
