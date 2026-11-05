import type { CheckLocation } from '@/api/types'

/** How long a timer start waits for the browser's place before going without it. */
const WAIT_MS = 8000

/**
 * The browser's place for a timer start or resume (Admin and help, slice 5): to 5 decimals (about a metre) with its
 * accuracy in metres; 'blocked' when the person refused; 'none' when the device has none or doesn't answer in time.
 */
export function currentLocation(waitMs = WAIT_MS): Promise<CheckLocation> {
  const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation
  if (!geo) return Promise.resolve('none')
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('none'), waitMs)
    const done = (value: CheckLocation) => {
      clearTimeout(timer)
      resolve(value)
    }
    const round = (n: number) => Math.round(n * 100_000) / 100_000
    geo.getCurrentPosition(
      (p) => done({ lat: round(p.coords.latitude), lng: round(p.coords.longitude), accuracy: Math.round(p.coords.accuracy) }),
      (e) => done(e.code === 1 ? 'blocked' : 'none'),
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: waitMs },
    )
  })
}
