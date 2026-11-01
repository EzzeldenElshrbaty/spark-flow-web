import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Where Tab (or Shift+Tab with `shift`) goes from `active` in a focus trap: round from one end to the other, and
 * from anything that isn't an item (the panel itself, after a click on its padding) to the first or last item.
 * null leaves it to the browser.
 */
export function wrapFocus<T>(items: T[], active: T | null, shift: boolean): T | null {
  const first = items[0]
  const last = items.at(-1)
  if (first === undefined || last === undefined) return null
  if (active === null || !items.includes(active)) return shift ? last : first
  if (shift && active === first) return last
  if (!shift && active === last) return first
  return null
}

/**
 * Dialog focus for a panel that isn't a Sheet (the phone drawer): focus moves in on open, Tab and Shift+Tab stay
 * inside, Escape closes, and focus goes back where it was. Keys pressed inside something opened from the panel
 * (a Sheet, which renders elsewhere) are left to it.
 */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    ;(ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = ref.current
      if (!panel || !(event.target instanceof Node) || !panel.contains(event.target)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const to = wrapFocus([...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0), document.activeElement as HTMLElement | null, event.shiftKey)
      if (to) {
        event.preventDefault()
        to.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Back to what had focus (the menu button), if it's still on the page.
      if (before && document.contains(before)) before.focus()
    }
  }, [open, ref])
}
