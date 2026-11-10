import clsx from 'clsx'
import { X } from 'lucide-react'
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { trapTab, useRestoreFocus } from '@/components/sf/layers'
import { focusAfterLayer } from '@/lib/pageFocus'
import { useUnsavedChanges } from '@/lib/unsavedChanges'
import { Button } from './Button'

/** How a footer button closes its sheet: through the "Discard …?" question when the form has changes. */
const SheetClose = createContext<() => void>(() => {})

/** Closes the sheet this sits in, asking first when its form has changes (UX Phase 1, 1.2). */
export function useSheetClose() {
  return useContext(SheetClose)
}

/** How a control leaves the sheet for something else: asking first, then running that instead of closing. */
const SheetLeave = createContext<(then: () => void) => void>((then) => then())

/**
 * Leaves the sheet for another step (Edit person's Deactivate…): asks "Discard …?" first when its form has changes,
 * then runs `then` instead of the sheet's own close (UX Phase 6).
 */
export function useSheetLeave() {
  return useContext(SheetLeave)
}

/** A sheet's Cancel: closes it, asking "Discard …?" first when its form has changes. */
export function SheetCancelButton({ children = 'Cancel', disabled }: { children?: ReactNode; disabled?: boolean }) {
  const close = useSheetClose()
  return (
    <Button variant="secondary" onClick={close} disabled={disabled}>
      {children}
    </Button>
  )
}

/**
 * A modal surface. `dialog` is centred on desktop; `drawer` slides in from the right.
 * On phones both take the full screen so forms have room.
 * By default it closes only through its own controls (X, Cancel, Save), so a stray click outside or
 * Escape can't throw away a half-filled form. Read-only panels can pass `dismissible` to also close on
 * Escape and backdrop clicks.
 * A form with changes passes `dirty`: then ✕, Cancel (`SheetCancelButton`) and the browser's Back ask
 * `discardQuestion` in the footer (Keep editing · Discard) before anything is thrown away (UX Phase 1, 1.2).
 * It renders at the end of the page, so the dimmed backdrop covers the whole screen even when it is opened from
 * the top bar (whose blur would otherwise keep the backdrop inside the bar).
 * Tab stays inside it, and closing gives focus back to what opened it, or to the page's heading when that's gone
 * (UX Phase 5A, 5.5).
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
  dirty = false,
  discardQuestion = 'Discard your changes?',
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
  /** The form has changes: closing asks `discardQuestion` first. */
  dirty?: boolean
  discardQuestion?: string
  children: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // The open "Discard …?" question: what Discard and Keep editing do.
  const [asking, setAsking] = useState<{ discard: () => void; keep: () => void } | null>(null)
  const requestClose = () => (dirty ? setAsking({ discard: () => onCloseRef.current(), keep: () => {} }) : onCloseRef.current())
  const leave = (then: () => void) => (dirty ? setAsking({ discard: then, keep: () => {} }) : then())
  const requestCloseRef = useRef(requestClose)
  useEffect(() => {
    requestCloseRef.current = requestClose
  })
  // Back closes the sheet first (after asking) and keeps the page: the next Back leaves it.
  useUnsavedChanges(open && dirty, 'sheet', (_leave, stay) =>
    setAsking({
      discard: () => {
        stay()
        onCloseRef.current()
      },
      keep: stay,
    }),
  )

  // Before focus moves in below, so it remembers what had focus.
  useRestoreFocus(open, focusAfterLayer)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) requestCloseRef.current()
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
      <div className="absolute inset-0 bg-black/50 motion-safe:animate-fade-in" onClick={dismissible ? requestClose : undefined} aria-hidden data-close />
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={(event) => {
          // Keys in something portaled out of the sheet (a date picker, a phone menu) are its own.
          if (panelRef.current?.contains(event.target as Node)) trapTab(event, panelRef.current)
        }}
        className={clsx(
          'relative flex w-full flex-col bg-surface shadow-xl outline-none max-sm:h-full',
          variant === 'drawer'
            ? 'ms-auto h-full motion-safe:animate-slide-in-end sm:max-w-lg sm:border-s sm:border-line'
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
          <button type="button" onClick={requestClose} className="-me-1 rounded-md p-1 text-fg-muted hover:bg-surface-muted hover:text-fg max-md:touch-target" aria-label="Close" title="Close" data-close>
            <X className="size-5" />
          </button>
        </div>
        {/* On phones the last row clears the home bar (safe-area inset). */}
        <div className={clsx('min-h-0 flex-1 overflow-y-auto px-5 pt-4', footer ? 'pb-4' : 'pb-[calc(1rem+env(safe-area-inset-bottom))]')}>
          <SheetClose.Provider value={requestClose}>
            <SheetLeave.Provider value={leave}>{children}</SheetLeave.Provider>
          </SheetClose.Provider>
        </div>
        {(footer || asking) && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
            {asking ? (
              <>
                <p className="me-auto text-sm font-medium text-fg" role="status">
                  {discardQuestion}
                </p>
                <Button
                  variant="secondary"
                  autoFocus
                  onClick={() => {
                    setAsking(null)
                    asking.keep()
                    // The button goes; focus stays in the sheet, so Tab can't reach the page behind it.
                    panelRef.current?.focus()
                  }}
                >
                  Keep editing
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setAsking(null)
                    asking.discard()
                  }}
                >
                  Discard
                </Button>
              </>
            ) : (
              <SheetClose.Provider value={requestClose}>{footer}</SheetClose.Provider>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
