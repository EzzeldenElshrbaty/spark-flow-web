import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const phoneQuery = '(max-width: 639px)'

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
 * A dropdown panel for top-bar menus: anchored under its trigger on desktop, a bottom sheet on phones.
 * Closes on Escape (focus back to the trigger) and outside clicks, and keeps Tab inside while open.
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

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) onCloseRef.current()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
          'sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:max-h-[80vh] sm:rounded-xl sm:motion-safe:animate-pop-in',
          className,
        )}
      >
        {children}
      </div>
    </>
  )
  // The top bar's blur would trap a fixed sheet inside it, so on phones the menu renders at the page level.
  return phone ? createPortal(content, document.body) : content
}
