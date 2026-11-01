import { useEffect, useRef, type RefObject } from 'react'

/** Enough of an element to count as seen: half of it, or 200px of a tall one. */
const enough = (entry: IntersectionObserverEntry) => entry.isIntersecting && entry.intersectionRect.height >= Math.min(entry.boundingClientRect.height / 2, 200)

/**
 * Calls `onSeen` once the element has stayed on screen for `ms` while `active` (spec 6.12: a Threads card counts as
 * read after a second on screen). Scrolling past quicker doesn't count; turning active while on screen starts the wait.
 */
export function useSeen<T extends Element>(active: boolean, onSeen: () => void, ms = 1000): RefObject<T | null> {
  const ref = useRef<T>(null)
  const latest = useRef(onSeen)
  useEffect(() => {
    latest.current = onSeen
  })
  useEffect(() => {
    const el = ref.current
    if (!active || !el || typeof IntersectionObserver === 'undefined') return
    let timer: number | undefined
    // Once per stretch of being active: a refetch that is slow to say it's read doesn't ask again.
    let fired = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(timer)
        if (!fired && enough(entry))
          timer = window.setTimeout(() => {
            fired = true
            latest.current()
          }, ms)
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [active, ms])
  return ref
}
