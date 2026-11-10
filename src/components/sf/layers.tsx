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

/**
 * While `active`, remembers what had focus and gives focus back to it on close, or to `fallback` when it's gone (or was
 * the page itself, `body`). Only focus the close lost is given back: focus a person moved on (another row, beside a
 * panel) or that another open layer holds stays where it is (UX Phase 5A, final review).
 */
export function useRestoreFocus(active: boolean, fallback?: () => HTMLElement | null | undefined) {
  const fallbackRef = useRef(fallback)
  useEffect(() => {
    fallbackRef.current = fallback
  })
  const opener = useRef<HTMLElement | null>(null)
  // StrictMode runs the effect again straight after its cleanup, when focus is already inside the layer: that run keeps
  // the first run's opener (UX Phase 6; it lost focus to the page's heading in dev and in the whole-app tests).
  const again = useRef(false)
  useEffect(() => {
    if (!active) return
    if (!again.current) opener.current = document.activeElement as HTMLElement | null
    again.current = false
    return () => {
      again.current = true
      queueMicrotask(() => {
        again.current = false
      })
      const previous = opener.current
      const now = document.activeElement
      if (now && now !== document.body && now.isConnected) return
      if (previous && previous !== document.body && previous.isConnected) previous.focus()
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

/** Inside a modal: its menus and popovers stack above it (`--z-modal-layer`), not under it (`--z-menu`). */
const InModal = createContext(false)

export function InModalScope({ children }: { children: ReactNode }) {
  return <InModal.Provider value>{children}</InModal.Provider>
}

/** The z-index class a menu or popover takes where it opens. */
export function useLayerZ(): string {
  return useContext(InModal) ? 'z-[var(--z-modal-layer)]' : 'z-[var(--z-menu)]'
}
