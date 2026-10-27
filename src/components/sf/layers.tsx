import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Menus, submenus, modals and tooltips stack. Escape closes only the top-most open layer.
const stack: symbol[] = []

/** While `active`, Escape calls `onEscape` if this is the top-most layer. */
export function useEscapeLayer(active: boolean, onEscape: () => void) {
  const onEscapeRef = useRef(onEscape)
  useEffect(() => {
    onEscapeRef.current = onEscape
  })
  useEffect(() => {
    if (!active) return
    const id = Symbol('layer')
    stack.push(id)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || stack[stack.length - 1] !== id) return
      event.preventDefault()
      onEscapeRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      stack.splice(stack.indexOf(id), 1)
    }
  }, [active])
}

/** While `active`, remembers what had focus and gives focus back to it on close. */
export function useRestoreFocus(active: boolean) {
  useEffect(() => {
    if (!active) return
    const previous = document.activeElement as HTMLElement | null
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [active])
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
}

/** Keeps Tab and Shift+Tab inside `container`. */
export function trapTab(event: KeyboardEvent | React.KeyboardEvent, container: HTMLElement) {
  if (event.key !== 'Tab') return
  const items = focusables(container)
  if (items.length === 0) {
    event.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

/** Renders at the end of the page inside `.sf`, so the redesign's tokens and font apply. */
export function SfPortal({ children }: { children: ReactNode }) {
  return createPortal(<div className="sf">{children}</div>, document.body)
}
