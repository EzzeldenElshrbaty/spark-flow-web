import clsx from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A modal surface. `dialog` is centred on desktop; `drawer` slides in from the right.
 * On phones both take the full screen so forms have room.
 * By default it closes only through its own controls (X, Cancel, Save), so a stray click outside or
 * Escape can't throw away a half-filled form. Read-only panels can pass `dismissible` to also close on
 * Escape and backdrop clicks.
 * It renders at the end of the page, so the dimmed backdrop covers the whole screen even when it is opened from
 * the top bar (whose blur would otherwise keep the backdrop inside the bar).
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  variant = 'dialog',
  footer,
  dismissible = false,
  wide = false,
  focusFirstField = true,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  variant?: 'dialog' | 'drawer'
  footer?: ReactNode
  dismissible?: boolean
  /** A wider dialog, for documents and tables; 'full' for side-by-side editors. */
  wide?: boolean | 'full'
  /** Off for sheets opened by a tap on a phone, so the keyboard doesn't jump up before the person chooses a field. */
  focusFirstField?: boolean
  children: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    // Focus the first field (or the panel) once on open, so keyboard users start inside the sheet.
    const first = focusFirstField ? panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])') : null
    ;(first ?? panelRef.current)?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, dismissible, focusFirstField])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      {/* The backdrop stays visible; it only closes the sheet when it's dismissible. */}
      <div className="absolute inset-0 bg-black/50 motion-safe:animate-fade-in" onClick={dismissible ? onClose : undefined} aria-hidden data-close />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'relative flex w-full flex-col bg-surface shadow-xl outline-none max-sm:h-full',
          variant === 'drawer'
            ? 'ml-auto h-full motion-safe:animate-slide-in-right sm:max-w-lg sm:border-l sm:border-line'
            : clsx('m-auto motion-safe:animate-pop-in sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-line', wide === 'full' ? 'sm:max-w-6xl' : wide ? 'sm:max-w-3xl' : 'sm:max-w-md'),
        )}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-line-subtle px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="-mr-1 rounded-md p-1 text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Close" data-close>
            <X className="size-5" />
          </button>
        </div>
        {/* On phones the last row clears the home bar (safe-area inset). */}
        <div className={clsx('min-h-0 flex-1 overflow-y-auto px-5 pt-4', footer ? 'pb-4' : 'pb-[calc(1rem+env(safe-area-inset-bottom))]')}>{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-line-subtle px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
