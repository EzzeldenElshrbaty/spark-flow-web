import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * Whether a sideways scroller has more past its end edge (right, or left in RTL): for an end fade or a "more" cue.
 * Follows scrolling and both the box's and its content's size (UX Phase 5B; DataTable since UX Phase 4).
 */
export function useScrollEnd(ref: RefObject<HTMLElement | null>): boolean {
  const [more, setMore] = useState(false)
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    const check = () => setMore(box.scrollWidth - box.clientWidth - Math.abs(box.scrollLeft) > 1)
    check()
    box.addEventListener('scroll', check, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check)
    observer?.observe(box)
    if (box.firstElementChild) observer?.observe(box.firstElementChild)
    return () => {
      box.removeEventListener('scroll', check)
      observer?.disconnect()
    }
  }, [ref])
  return more
}
