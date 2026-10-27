import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Kbd } from './Badge'
import { SfPortal, useEscapeLayer } from './layers'

/** Hover delay before a tooltip shows (spec 6.15); keyboard focus shows it at once. */
export const TOOLTIP_DELAY_MS = 500

type TriggerProps = {
  'aria-describedby'?: string
  onPointerEnter?: (event: React.PointerEvent) => void
  onPointerLeave?: (event: React.PointerEvent) => void
  onFocus?: (event: React.FocusEvent) => void
  onBlur?: (event: React.FocusEvent) => void
}

/**
 * Ink tooltip above its trigger (below when there is no room). `describe` links it with aria-describedby,
 * for extra text such as a full date; an icon button's tooltip only repeats its aria-label, so it stays hidden.
 */
export function Tooltip({
  label,
  sub,
  shortcut,
  describe = false,
  children,
}: {
  label: ReactNode
  sub?: ReactNode
  shortcut?: string[]
  describe?: boolean
  children: ReactElement<TriggerProps>
}) {
  const id = useId()
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const triggerEl = useRef<Element | null>(null)
  const open = anchor !== null

  const hide = () => {
    window.clearTimeout(timer.current)
    setAnchor(null)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEscapeLayer(open, hide)

  const show = (el: Element) => setAnchor(el.getBoundingClientRect())
  const props = children.props
  const trigger = cloneElement(children, {
    'aria-describedby': describe ? id : props['aria-describedby'],
    onPointerEnter: (event: React.PointerEvent) => {
      props.onPointerEnter?.(event)
      if (event.pointerType === 'touch') return
      const el = event.currentTarget
      triggerEl.current = el
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => show(el), TOOLTIP_DELAY_MS)
    },
    onPointerLeave: (event: React.PointerEvent) => {
      props.onPointerLeave?.(event)
      hide()
    },
    onFocus: (event: React.FocusEvent) => {
      props.onFocus?.(event)
      if (event.currentTarget.matches(':focus-visible')) show(event.currentTarget)
    },
    onBlur: (event: React.FocusEvent) => {
      props.onBlur?.(event)
      hide()
    },
  })

  const below = anchor !== null && anchor.top < 48
  return (
    <>
      {trigger}
      {/* Kept mounted while described, so aria-describedby always points at real text. */}
      {(open || describe) && (
        <SfPortal>
          <div
            id={id}
            role="tooltip"
            aria-hidden={describe ? undefined : true}
            hidden={!open}
            style={
              anchor
                ? {
                    position: 'fixed',
                    top: below ? anchor.bottom + 8 : anchor.top - 8,
                    left: anchor.left + anchor.width / 2,
                    transform: below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
                  }
                : undefined
            }
            className="pointer-events-none z-[var(--z-toast)] inline-flex max-w-60 flex-col items-center gap-0.5 rounded-sf-md bg-sf-ink-950 px-2 py-1 text-center font-sf text-[12px]/[16px] font-medium text-sf-white shadow-[0_0_0_1px_var(--ink-700)]"
          >
            <span className="inline-flex items-center gap-1">
              {label}
              {shortcut?.map((key) => (
                <Kbd key={key} onDark>
                  {key}
                </Kbd>
              ))}
            </span>
            {sub && <span className="font-normal text-sf-ink-300">{sub}</span>}
          </div>
        </SfPortal>
      )}
    </>
  )
}
