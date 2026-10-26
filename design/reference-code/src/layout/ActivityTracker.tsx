import { useEffect } from 'react'
import { backendOn } from '../lib/api'
import { pingActivity } from '../lib/activityApi'
import { useAuth } from '../lib/useAuth'

/** How often the app reports use while someone is using it. */
const PING_EVERY = 60_000

/** No click, key, scroll or touch for this long, and the person counts as away even with the page open. */
const IDLE_AFTER = 5 * 60_000

/**
 * Reports to the API, about once a minute, that someone is really using the app: the page is on screen and they
 * clicked, typed, scrolled or touched it in the last few minutes. Management sees the result in Settings → User
 * activity. A tab left open in the background, or a computer left on overnight, doesn't count.
 */
export function ActivityTracker() {
  const { me } = useAuth()
  const tracking = backendOn && !!me && !me.mustChangePassword

  useEffect(() => {
    if (!tracking) return
    // Opening the app (or signing in) is use.
    let lastUse = Date.now()
    let lastPing = 0

    const ping = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastUse > IDLE_AFTER) return
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
