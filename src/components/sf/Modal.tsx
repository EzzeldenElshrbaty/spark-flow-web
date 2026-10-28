import { IconX } from '@tabler/icons-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'
import { focusables, SfPortal, trapTab, useEscapeLayer, useRestoreFocus } from './layers'

/**
 * Centred dialog on the overlay scrim (spec 6.13). Focus moves in and is trapped, and goes back to what
 * opened it on close. It closes with × or Esc, never with a stray click on the scrim.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  actions,
  footer,
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
  children?: ReactNode
}) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEscapeLayer(open, onClose)
  useRestoreFocus(open)

  useEffect(() => {
    if (!open || !panelRef.current) return
    const items = focusables(panelRef.current)
    // The first field if there is one, else the first control after the close button.
    const field = items.find((el) => el.matches('input, textarea, select'))
    ;(field ?? items[1] ?? items[0])?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [open])

  if (!open) return null
  return (
    <SfPortal>
      <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center overflow-auto bg-sf-overlay py-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          // 540px, or the screen less 16px a side on a phone (spec 6.10). Against the viewport: a percentage would be of
          // the grid track the dialog itself sizes, and leave it 508px wide.
          onKeyDown={(event) => trapTab(event, event.currentTarget)}
          className="w-[min(540px,calc(100vw-32px))] rounded-sf-lg bg-sf-surface-raised p-6 text-sf-text shadow-sf-modal"
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
            <IconButton label="Close" icon={IconX} onClick={onClose} className={actions ? undefined : 'ms-auto'} tooltip={false} />
          </div>
          {children}
          {footer && <div className="mt-6 flex items-center justify-end gap-2">{footer}</div>}
        </div>
      </div>
    </SfPortal>
  )
}
