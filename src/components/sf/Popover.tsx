import clsx from 'clsx'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { focusables, isRtl, placeBelow, SfPortal, trapTab, useEscapeLayer } from './layers'
import { usePhone } from './usePhone'

export type PopoverTriggerProps = {
  ref: RefObject<HTMLButtonElement | null>
  'aria-haspopup': 'dialog'
  'aria-expanded': boolean
  'aria-controls': string | undefined
  onClick: () => void
}

/**
 * A small card opened from a trigger (the profile card): a labelled, non-modal dialog under the trigger, a bottom
 * sheet on phones. It focuses its first control and keeps Tab inside; Escape or a press outside closes it and focus
 * goes back to the trigger. `children` gets `close` for actions that are done with it.
 */
export function Popover({
  label,
  trigger,
  className,
  children,
}: {
  label: string
  trigger: (props: PopoverTriggerProps) => ReactNode
  className?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }
  return (
    <>
      {trigger({ ref: triggerRef, 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-controls': open ? id : undefined, onClick: () => setOpen((o) => !o) })}
      {open && (
        <Panel id={id} label={label} anchorRef={triggerRef} onClose={close} className={className}>
          {children(close)}
        </Panel>
      )}
    </>
  )
}

function Panel({
  id,
  label,
  anchorRef,
  onClose,
  className,
  children,
}: {
  id: string
  label: string
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const phone = usePhone()
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useEscapeLayer(true, onClose)

  useLayoutEffect(() => {
    const anchor = anchorRef.current?.getBoundingClientRect()
    const panel = panelRef.current
    if (!anchor || !panel || phone) return
    const { width, height } = panel.getBoundingClientRect()
    setPos(placeBelow(anchor, { width, height }, isRtl(panel.parentElement ?? panel)))
  }, [anchorRef, phone])

  // Focus waits until the panel is placed: a hidden panel can't take focus.
  const placed = phone || pos !== null
  useEffect(() => {
    if (placed && panelRef.current) focusables(panelRef.current)[0]?.focus({ preventScroll: true })
  }, [placed])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [anchorRef, onClose])

  return (
    <SfPortal>
      {phone && <div aria-hidden className="fixed inset-0 z-[var(--z-menu)] bg-sf-overlay" />}
      <div
        ref={panelRef}
        id={id}
        role="dialog"
        aria-label={label}
        onKeyDown={(event) => panelRef.current && trapTab(event, panelRef.current)}
        style={phone ? undefined : pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
        className={clsx(
          'sf-ui fixed z-[var(--z-menu)] bg-sf-surface-raised text-sf-text shadow-sf-menu outline-none',
          phone ? 'inset-x-0 bottom-0 rounded-t-sf-lg pb-[max(16px,env(safe-area-inset-bottom))]' : 'w-[300px] max-w-[calc(100vw-16px)] rounded-sf-lg',
          className,
        )}
      >
        {children}
      </div>
    </SfPortal>
  )
}
