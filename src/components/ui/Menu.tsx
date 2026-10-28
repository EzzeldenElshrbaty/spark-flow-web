import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const phoneQuery = '(max-width: 639px)'
/** The gap between the trigger and the panel (mt-2 / mb-2), and the panel's distance from the edge of its room. */
const GAP = 8
const EDGE = 8
/** However little room there is, a panel keeps one item's height (it scrolls inside). */
const MIN_HEIGHT = 40

/** Room above and below `el` inside everything that clips it: the window and every ancestor that scrolls or clips. */
function roomAround(el: HTMLElement) {
  const { top, bottom } = el.getBoundingClientRect()
  let start = 0
  let end = window.innerHeight
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).overflowY === 'visible') continue
    const box = node.getBoundingClientRect()
    start = Math.max(start, box.top)
    end = Math.min(end, box.bottom)
  }
  return { above: top - start, below: end - bottom }
}

/** True on phone widths. Phones get the menu as a bottom sheet rendered at the page level. */
function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(phoneQuery).matches)
  useEffect(() => {
    const media = window.matchMedia(phoneQuery)
    const onChange = () => setPhone(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return phone
}

/**
 * A dropdown panel for top-bar menus: anchored under its trigger on desktop (above it when it doesn't fit below,
 * as on a list's last row, and never past the room on that side), a bottom sheet on phones.
 * Closes on Escape (focus back to the trigger) and outside clicks, and keeps Tab inside while open. A plain letter
 * picks the item that names it as its key (`aria-keyshortcuts`).
 * Render it inside a `relative` wrapper that also contains the trigger.
 */
export function MenuPanel({
  open,
  onClose,
  triggerRef,
  label,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLButtonElement | null>
  label: string
  className?: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const phone = usePhone()
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  // Desktop: opens upward when it doesn't fit below its trigger and there's more room above, and is no taller than
  // the room on the side it opens to. Null until placed.
  const [place, setPlace] = useState<{ above: boolean; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!open || !trigger || !panel) return
    const room = roomAround(trigger)
    const above = !phone && panel.offsetHeight + GAP + EDGE > room.below && room.above > room.below
    setPlace({ above, maxHeight: Math.max(MIN_HEIGHT, (above ? room.above : room.below) - GAP - EDGE) })
    return () => setPlace(null)
  }, [open, phone, triggerRef])
  // Focus the first item once placed: focusing it where it was first drawn would scroll the list to it.
  useEffect(() => {
    if (place) panelRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
  }, [place])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) onCloseRef.current()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Used: a page key on Escape (the channel's mark read) leaves it alone.
        event.preventDefault()
        onCloseRef.current()
        triggerRef.current?.focus()
      }
      if (event.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)')]
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
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, triggerRef])

  if (!open) return null
  const content = (
    <>
      {/* Phones: dim the page behind the sheet. */}
      <div className="fixed inset-0 z-40 bg-black/40 motion-safe:animate-fade-in sm:hidden" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        className={clsx(
          'z-50 overflow-y-auto border border-line bg-surface shadow-xl',
          'max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[85vh] max-sm:rounded-t-2xl max-sm:pb-[env(safe-area-inset-bottom)] max-sm:motion-safe:animate-fade-up',
          'sm:absolute sm:end-0 sm:max-h-[80vh] sm:rounded-xl sm:motion-safe:animate-pop-in',
          place?.above ? 'sm:bottom-full sm:mb-2' : 'sm:top-full sm:mt-2',
          className,
        )}
        style={place && !phone ? { maxHeight: `min(80vh, ${place.maxHeight}px)` } : undefined}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.key.length !== 1) return
          const key = event.key.toLowerCase()
          const item = [...event.currentTarget.querySelectorAll<HTMLElement>('[aria-keyshortcuts]')].find((el) => el.getAttribute('aria-keyshortcuts')?.toLowerCase() === key)
          if (!item) return
          event.preventDefault()
          item.click()
        }}
      >
        {children}
      </div>
    </>
  )
  // The top bar's blur would trap a fixed sheet inside it, so on phones the menu renders at the page level.
  return phone ? createPortal(content, document.body) : content
}
