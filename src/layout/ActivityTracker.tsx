import { useEffect } from 'react'
import { pingActivity } from '@/api/attendance'
import { useMe } from '@/api/users'
import { isActive } from '@/lib/people'

/** How often the app reports use while someone is using it. */
const PING_EVERY = 60_000

/** No click, key, scroll or touch for this long, and the person counts as away even with the page open. */
const IDLE_AFTER = 5 * 60_000

/**
 * Reports, about once a minute, that someone is really using Flow (from the CRM's, Admin and help slice 5): the page
 * is on screen and they clicked, typed, scrolled or touched it in the last few minutes. Settings → Attendance shows the
 * result. A tab left open in the background, or a computer left on overnight, doesn't count.
 */
export function ActivityTracker() {
  const me = useMe().data
  const tracking = Boolean(me && isActive(me))

  useEffect(() => {
    if (!tracking) return
    // Opening the app (or signing in) is use.
    let lastUse = Date.now()
    let lastPing = 0

    const ping = () => {
      // Hidden, idle, or reported moments ago (coming back pings at once; the next tick mustn't count it twice).
      if (document.visibilityState !== 'visible' || Date.now() - lastUse > IDLE_AFTER || Date.now() - lastPing < PING_EVERY / 2) return
      lastPing = Date.now()
      // Losing one is harmless: the next one carries on the same visit.
      pingActivity().catch(() => {})
    }
    const used = () => {
      lastUse = Date.now()
      // Back after a quiet spell: report it now rather than at the next tick.
      if (Date.now() - lastPing >= PING_EVERY) ping()
    }
    const shown = () => document.visibilityState === 'visible' && used()

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
    events.forEach((name) => window.addEventListener(name, used, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', shown)
    ping()
    const timer = window.setInterval(ping, PING_EVERY)
    return () => {
      events.forEach((name) => window.removeEventListener(name, used, { capture: true }))
      document.removeEventListener('visibilitychange', shown)
      window.clearInterval(timer)
    }
  }, [tracking])

  return null
}
