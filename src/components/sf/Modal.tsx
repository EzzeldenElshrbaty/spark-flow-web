import { IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useUnsavedChanges } from '@/lib/unsavedChanges'
import { Button, IconButton } from './Button'
import { focusables, InModalScope, SfPortal, trapTab, useEscapeLayer, useRestoreFocus } from './layers'

/** How a footer button closes its dialog: through the "Discard …?" question when the form has changes. */
const ModalClose = createContext<() => void>(() => {})

/** Closes the dialog this sits in, asking first when its form has changes (UX Phase 3, as `useSheetClose`). */
export function useModalClose() {
  return useContext(ModalClose)
}

/** A dialog's Cancel: closes it, asking "Discard …?" first when its form has changes. */
export function ModalCancelButton({ children = 'Cancel', disabled, touch }: { children?: ReactNode; disabled?: boolean; touch?: boolean }) {
  const close = useModalClose()
  return (
    <Button touch={touch} onClick={close} disabled={disabled}>
      {children}
    </Button>
  )
}

/**
 * Centred dialog on the overlay scrim (spec 6.13). Focus moves in and is trapped, and goes back to what
 * opened it on close. It closes with × or Esc, never with a stray click on the scrim.
 * A form with changes passes `dirty`: then ×, Esc, Cancel (`ModalCancelButton`) and the browser's Back ask
 * `discardQuestion` in the footer (Keep editing · Discard) before anything is thrown away (UX Phase 3, as `Sheet`).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  actions,
  footer,
  fallbackFocus,
  wide = false,
  dirty = false,
  discardQuestion = 'Discard your changes?',
  keepLabel = 'Keep editing',
  children,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  /** Controls beside the title, before × (Channel details: star, notification level). */
  actions?: ReactNode
  /** Buttons, end-aligned. One primary at most. */
  footer?: ReactNode
  /** Where focus goes on close when what opened the dialog is gone (an "Add a topic" that a saved topic replaced). */
  fallbackFocus?: () => HTMLElement | null | undefined
  /** 720px instead of 540 (spec 6.10: the snippet). */
  wide?: boolean
  /** The form has changes: closing asks `discardQuestion` first. */
  dirty?: boolean
  discardQuestion?: string
  /** The button that goes back from `discardQuestion` (voice messages: "Keep recording"). */
  keepLabel?: string
  children?: ReactNode
}) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  // The open "Discard …?" question: what Discard and Keep editing do.
  const [asking, setAsking] = useState<{ discard: () => void; keep: () => void } | null>(null)
  const requestClose = () => (dirty ? setAsking({ discard: () => onCloseRef.current(), keep: () => {} }) : onCloseRef.current())
  // Back closes the dialog first (after asking) and keeps the page: the next Back leaves it.
  useUnsavedChanges(open && dirty, 'sheet', (_leave, stay) =>
    setAsking({
      discard: () => {
        stay()
        onCloseRef.current()
      },
      keep: stay,
    }),
  )

  useEscapeLayer(open, requestClose)
  useRestoreFocus(open, fallbackFocus)

  useEffect(() => {
    if (!open || !panelRef.current) return
    const items = focusables(panelRef.current)
    // The first field if there is one, else the first control after the close button (actions beside the title come
    // before it).
    const field = items.find((el) => el.matches('input, textarea, select'))
    const afterClose = items[items.indexOf(closeRef.current!) + 1]
    ;(field ?? afterClose ?? items[0])?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [open])

  if (!open) return null
  return (
    <SfPortal>
      <InModalScope>
        {/* A press on the scrim is held: it neither closes the dialog nor sends focus to the page's body (spec 10). */}
        <div
          className="fixed inset-0 z-[var(--z-modal)] grid place-items-center overflow-auto bg-sf-overlay py-4"
          onMouseDown={(event) => event.target === event.currentTarget && event.preventDefault()}
        >
          <div
            ref={panelRef}
            // A press on the dialog's own padding focuses the dialog, so focus stays inside.
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            // 540px, or the screen less 16px a side on a phone (spec 6.10). Against the viewport: a percentage would be of
            // the grid track the dialog itself sizes, and leave it 508px wide.
            onKeyDown={(event) => trapTab(event, event.currentTarget)}
            className={clsx(wide ? 'w-[min(720px,calc(100vw-32px))]' : 'w-[min(540px,calc(100vw-32px))]', 'rounded-sf-lg bg-sf-surface-raised p-6 text-sf-text shadow-sf-modal outline-none')}
          >
            <div className="mb-4 flex items-start gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="sf-title m-0 text-sf-text">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="sf-small mt-1 mb-0 text-sf-text-secondary">
                    {description}
                  </p>
                )}
              </div>
              {actions && <div className="ms-auto flex flex-none items-center gap-1">{actions}</div>}
              {/* A 44px touch target on phones (spec 6.16) around the 32px ×. */}
              <IconButton
                ref={closeRef}
                label="Close"
                icon={IconX}
                onClick={requestClose}
                className={`relative max-md:after:absolute max-md:after:-inset-1.5 ${actions ? '' : 'ms-auto'}`}
              />
            </div>
            <ModalClose.Provider value={requestClose}>{children}</ModalClose.Provider>
            {(footer || asking) && (
              <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                {asking ? (
                  <>
                    <p className="sf-ui-medium me-auto mb-0 text-sf-text" role="status">
                      {discardQuestion}
                    </p>
                    <Button
                      touch
                      autoFocus
                      onClick={() => {
                        setAsking(null)
                        asking.keep()
                        // The button goes; focus stays in the dialog, so Tab can't reach the page behind it.
                        panelRef.current?.focus()
                      }}
                    >
                      {keepLabel}
                    </Button>
                    <Button
                      touch
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
                  <ModalClose.Provider value={requestClose}>{footer}</ModalClose.Provider>
                )}
              </div>
            )}
          </div>
        </div>
      </InModalScope>
    </SfPortal>
  )
}
