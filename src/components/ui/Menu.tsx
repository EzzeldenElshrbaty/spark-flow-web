import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const phoneQuery = '(max-width: 639px)'
/** The gap between the trigger and the panel (mt-2 / mb-2), and the panel's distance from the edge of its room. */
const GAP = 8
const EDGE = 8
/** However little room there is, a panel keeps one item's height (it scrolls inside). */
const MIN_HEIGHT = 40

/** A row in a MenuPanel (RowMenu, comment and entry menus). */
export const menuItemClass = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-fg-secondary hover:bg-surface-muted'

const ITEMS = '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)'

/**
 * Where ↓, ↑, Home or End moves from `active` among a menu's items: round from one end to the other; from outside the
 * items (nothing yet) ↓ and Home go to the first, ↑ and End to the last. null for any other key (UX Phase 5A, 5.5).
 */
export function menuStep<T>(items: T[], active: T | null, key: string): T | null {
  if (items.length === 0) return null
  const at = active === null ? -1 : items.indexOf(active)
  if (key === 'Home') return items[0]
  if (key === 'End') return items[items.length - 1]
  if (key === 'ArrowDown') return items[(at + 1) % items.length]
  if (key === 'ArrowUp') return items[at <= 0 ? items.length - 1 : at - 1]
  return null
}

/**
 * Room above and below `el` in the window and every ancestor that scrolls up and down (a long list keeps its menus
 * inside it). Ancestors that only hide what overflows them (a table cell, a box that scrolls sideways) don't count: the
 * panel is drawn at the page level, out of their reach (UX Phase 6).
 */
function roomForMenu(el: HTMLElement) {
  const { top, bottom } = el.getBoundingClientRect()
  let start = 0
  let end = window.innerHeight
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow !== 'auto' && overflow !== 'scroll') || node.scrollHeight <= node.clientHeight + 1) continue
    const box = node.getBoundingClientRect()
    start = Math.max(start, box.top)
    end = Math.min(end, box.bottom)
  }
  return { above: top - start, below: end - bottom }
}

/** Where a desktop panel goes, in the window: against its trigger's end edge, under it or above it. */
type Place = { above: boolean; maxHeight: number; top?: number; bottom?: number; end: number }

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
 * as on a list's last row, and never past the room on that side), a bottom sheet on phones. Drawn at the page level on
 * both, so a table cell or a box that clips can't cut it off (UX Phase 6: a table row's menu was hidden by its cell);
 * on desktop it follows its trigger as the page scrolls.
 * Closes on Escape (focus back to the trigger) and outside clicks, and keeps Tab inside while open. A plain letter
 * picks the item that names it as its key (`aria-keyshortcuts`); ↓ ↑ Home End move between items, and a pick that
 * closes the menu gives focus back to the trigger, so a sheet it opens returns there too (UX Phase 5A, 5.5).
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
  const [place, setPlace] = useState<Place | null>(null)
  useLayoutEffect(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!open || !trigger || !panel) return
    const same = (a: Place | null, b: Place) => a !== null && a.above === b.above && a.maxHeight === b.maxHeight && a.top === b.top && a.bottom === b.bottom && a.end === b.end
    const measure = () => {
      const room = roomForMenu(trigger)
      const box = trigger.getBoundingClientRect()
      const above = !phone && panel.offsetHeight + GAP + EDGE > room.below && room.above > room.below
      const rtl = getComputedStyle(trigger).direction === 'rtl'
      const next: Place = {
        above,
        maxHeight: Math.max(MIN_HEIGHT, (above ? room.above : room.below) - GAP - EDGE),
        ...(above ? { bottom: window.innerHeight - box.top + GAP } : { top: box.bottom + GAP }),
        // Against the trigger's end edge, but never past either edge of the window.
        end: Math.max(EDGE, Math.min(rtl ? box.left : document.documentElement.clientWidth - box.right, document.documentElement.clientWidth - panel.offsetWidth - EDGE)),
      }
      // Unchanged, it stays the same object: nothing re-renders (and nothing moves focus).
      setPlace((last) => (same(last, next) ? last : next))
    }
    measure()
    if (phone) return () => setPlace(null)
    // It sits in the window, so it moves with its trigger when the page or a list scrolls; once its trigger has
    // scrolled out of sight (out of its list, under the top bar), it closes rather than float over the page. A scroll
    // inside the panel itself changes nothing (UX Phase 6, final review).
    const triggerSeen = () => {
      const room = roomForMenu(trigger)
      const box = trigger.getBoundingClientRect()
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return room.above >= 0 && room.below >= 0 && Boolean(hit && (trigger.contains(hit) || panel.contains(hit)))
    }
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && panel.contains(event.target)) return
      if (!triggerSeen()) onCloseRef.current()
      else measure()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', measure)
      setPlace(null)
    }
  }, [open, phone, triggerRef])
  // Focus the first item once it's placed, once per opening: focusing it where it was first drawn would scroll the
  // list to it, and again later would undo a move down the menu (UX Phase 6, final review).
  const focused = useRef(false)
  useEffect(() => {
    if (!open) focused.current = false
    else if (place && !focused.current) {
      focused.current = true
      panelRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    // An outside click leaves focus where it put it; any other close (a pick) gives it back to the trigger.
    let clickedOutside = false
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        clickedOutside = true
        onCloseRef.current()
      }
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
      // Runs before a sheet the pick opened remembers what had focus. Focus a pick moved on (a rename field) stays.
      const focused = document.activeElement
      if (!clickedOutside && (!focused || focused === document.body || !focused.isConnected)) triggerRef.current?.focus()
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
          'sm:fixed sm:max-h-[80vh] sm:rounded-xl sm:motion-safe:animate-pop-in',
          className,
        )}
        style={
          phone
            ? undefined
            : place
              ? { maxHeight: `min(80vh, ${place.maxHeight}px)`, top: place.top, bottom: place.bottom, insetInlineEnd: place.end }
              : // Measured before it's placed: out of sight until then.
                { visibility: 'hidden', top: 0, insetInlineEnd: 0 }
        }
        onKeyDown={(event) => {
          const next = menuStep([...event.currentTarget.querySelectorAll<HTMLElement>(ITEMS)], document.activeElement as HTMLElement | null, event.key)
          if (next) {
            event.preventDefault()
            next.focus()
            return
          }
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
  // At the page level: the top bar's blur would trap a fixed sheet inside it on phones, and a table cell or a box that
  // clips would cut off a desktop panel (UX Phase 6). Inside a modal dialog (the task panel below 1280px), it's drawn
  // in that dialog, so screen readers that keep to the dialog still reach it (final review).
  return createPortal(content, triggerRef.current?.closest<HTMLElement>('[aria-modal="true"]') ?? document.body)
}
