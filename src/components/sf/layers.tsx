import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Menus, submenus, modals and tooltips stack. Escape closes only the top-most open layer.
const stack: symbol[] = []

/** Whether a menu, popover, modal or tooltip is open: a layer above the page, which takes Escape first. */
export function hasOpenLayer() {
  return stack.length > 0
}

/** While `active`, Escape calls `onEscape` if this is the top-most layer and nothing inside used the key first. */
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
      // A field that used the key itself (a suggestion list closing, an edit cancelled) said so with preventDefault.
      if (event.key !== 'Escape' || event.defaultPrevented || stack[stack.length - 1] !== id) return
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

/** While `active`, remembers what had focus and gives focus back to it on close, or to `fallback` when it's gone. */
export function useRestoreFocus(active: boolean, fallback?: () => HTMLElement | null | undefined) {
  const fallbackRef = useRef(fallback)
  useEffect(() => {
    fallbackRef.current = fallback
  })
  useEffect(() => {
    if (!active) return
    const previous = document.activeElement as HTMLElement | null
    return () => {
      if (previous?.isConnected) previous.focus()
      else fallbackRef.current?.()?.focus()
    }
  }, [active])
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** What Tab reaches inside `container`: never a control in a hidden part (a tab panel kept mounted behind another). */
export function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[hidden]'))
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
  // Focus on the container itself (a press on a dialog's padding): Tab goes to its first control, Shift+Tab its last.
  if (document.activeElement === container) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const DarkScope = createContext(false)

/** Forces the dark theme on what it wraps, portals included (the /dev/ui gallery's dark column). */
export function SfDarkScope({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <DarkScope.Provider value>
      <div className={className ? `dark ${className}` : 'dark'}>{children}</div>
    </DarkScope.Provider>
  )
}

/** Renders at the end of the page inside `.sf`, so the redesign's tokens and font apply. */
export function SfPortal({ children }: { children: ReactNode }) {
  const dark = useContext(DarkScope)
  const content = <div className="sf">{children}</div>
  return createPortal(dark ? <div className="dark">{content}</div> : content, document.body)
}

export function isRtl(el: Element) {
  return getComputedStyle(el).direction === 'rtl'
}

/**
 * Where a panel opens under its trigger: lined up with the trigger's start edge, moved in to stay 8px inside the
 * window, and above the trigger when there is no room below.
 */
export function placeBelow(anchor: DOMRect, panel: { width: number; height: number }, rtl: boolean): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = rtl ? anchor.right - panel.width : anchor.left
  if (left + panel.width > vw - 8) left = anchor.right - panel.width
  if (left < 8) left = 8
  let top = anchor.bottom + 4
  if (top + panel.height > vh - 8 && anchor.top - panel.height - 4 >= 8) top = anchor.top - panel.height - 4
  return { top: Math.max(8, Math.min(top, vh - panel.height - 8)), left: Math.max(8, left) }
}
