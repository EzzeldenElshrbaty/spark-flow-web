import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { focusPageHeading } from '@/lib/pageFocus'

/** How long to wait for a page's heading, while its data loads. */
const WAIT_MS = 5000

/** Focus is in the page itself (a tab, a field, a composer that focused itself), not left behind elsewhere. */
function focusInPage(main: HTMLElement | null): boolean {
  const active = document.activeElement
  return Boolean(main && active && active !== document.body && active.isConnected && main.contains(active))
}

/**
 * After a move to another page (a new path, not the first load), focus goes to the new page's heading when it was
 * left in the sidebar, top bar, bottom bar or drawer, or was lost; a screen reader then reads where you are. Focus
 * already in the page stays. A page whose heading comes after its data is waited for (UX Phase 5A, 5.7).
 */
export function RouteFocus() {
  const { pathname } = useLocation()
  // The path focus was last settled for: the first load's, so nothing moves then (StrictMode's second run included).
  const settled = useRef(pathname)
  useEffect(() => {
    if (settled.current === pathname) return
    settled.current = pathname
    const main = document.getElementById('main')
    if (focusInPage(main) || focusPageHeading() || !main) return
    const observer = new MutationObserver(() => {
      if (focusInPage(main) || focusPageHeading()) stop()
    })
    const timer = setTimeout(() => stop(), WAIT_MS)
    const stop = () => {
      observer.disconnect()
      clearTimeout(timer)
    }
    observer.observe(main, { childList: true, subtree: true })
    return stop
  }, [pathname])
  return null
}
