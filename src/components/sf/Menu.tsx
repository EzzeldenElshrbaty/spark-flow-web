import { IconCheck, IconChevronRight, type TablerIcon } from '@tabler/icons-react'
import clsx from 'clsx'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { Icon } from './Icon'
import { isRtl, placeBelow, SfPortal, useEscapeLayer } from './layers'
import { usePhone } from './usePhone'

type MenuContext = { rootId: string; closeAll: () => void; phone: boolean }
const Ctx = createContext<MenuContext | null>(null)

function useMenu() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('Menu items must be rendered inside <Menu>.')
  return ctx
}

const ITEM_ROLES = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'

/** Closes the whole menu (focus back to its trigger): for rows that aren't a `MenuItem`, such as a row of emoji. */
export function useCloseMenu() {
  return useMenu().closeAll
}


export type MenuTriggerProps = {
  ref: RefObject<HTMLButtonElement | null>
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string | undefined
  onClick: () => void
  onKeyDown: (event: React.KeyboardEvent) => void
}

/**
 * Dropdown menu (spec 6.5): opens under its trigger, a bottom sheet on phones. Arrow keys, Home/End and
 * typing a letter move between items; Enter selects; Esc closes the top-most level; focus goes back to the
 * trigger. Tab stays inside while open.
 */
export function Menu({
  label,
  trigger,
  children,
}: {
  /** Accessible name of the menu, e.g. "Message actions". */
  label: string
  trigger: (props: MenuTriggerProps) => ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState<false | 'first' | 'last'>(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const rootId = useId()
  const panelId = `${rootId}-menu`
  const phone = usePhone()

  const closeAll = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open !== false,
        'aria-controls': open ? panelId : undefined,
        onClick: () => setOpen((o) => (o ? false : 'first')),
        onKeyDown: (event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(event.key === 'ArrowDown' ? 'first' : 'last')
          }
        },
      })}
      {open && (
        <Ctx.Provider value={{ rootId, closeAll, phone }}>
          <MenuPanel
            id={panelId}
            label={label}
            anchorRef={triggerRef}
            side={false}
            initialFocus={open}
            onClose={closeAll}
            onOutside={closeAll}
          >
            {children}
          </MenuPanel>
        </Ctx.Provider>
      )}
    </>
  )
}

function MenuPanel({
  id,
  label,
  anchorRef,
  side,
  initialFocus,
  onClose,
  onOutside,
  children,
}: {
  id: string
  label: string
  anchorRef: RefObject<HTMLElement | null>
  /** Submenus open to the end side of their item; the root opens below its trigger. */
  side: boolean
  initialFocus: 'first' | 'last'
  onClose: () => void
  /** Root only: a press outside every level closes the whole menu. */
  onOutside?: () => void
  children: ReactNode
}) {
  const { rootId, phone } = useMenu()
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const typed = useRef({ text: '', at: 0 })

  useEscapeLayer(true, onClose)

  useLayoutEffect(() => {
    const anchor = anchorRef.current?.getBoundingClientRect()
    const panel = panelRef.current
    if (!anchor || !panel || phone) return
    const { width, height } = panel.getBoundingClientRect()
    const rtl = isRtl(panel.parentElement ?? panel)
    if (!side) return setPos(placeBelow(anchor, { width, height }, rtl))
    const vw = window.innerWidth
    const vh = window.innerHeight
    const toEnd = rtl ? anchor.left - width : anchor.right
    const toStart = rtl ? anchor.right : anchor.left - width
    const endFits = rtl ? toEnd >= 8 : toEnd + width <= vw - 8
    const top = anchor.top - 8
    setPos({ top: Math.max(8, Math.min(top, vh - height - 8)), left: Math.max(8, endFits ? toEnd : toStart) })
  }, [anchorRef, side, phone])

  // Focus the first (or last) item once the panel is placed: a hidden panel can't take focus.
  const placed = phone || pos !== null
  const focusedOnce = useRef(false)
  useEffect(() => {
    if (!placed || focusedOnce.current) return
    focusedOnce.current = true
    const items = panelRef.current ? [...panelRef.current.querySelectorAll<HTMLElement>(ITEM_ROLES)] : []
    ;(initialFocus === 'first' ? items[0] : items[items.length - 1])?.focus({ preventScroll: true })
  }, [placed, initialFocus])

  useEffect(() => {
    if (!onOutside) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element
      if (target.closest?.(`[data-sf-menu="${rootId}"]`) || anchorRef.current?.contains(target)) return
      onOutside()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onOutside, rootId, anchorRef])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const panel = panelRef.current
    if (!panel) return
    // Keys inside a submenu are handled by the submenu's own panel.
    if ((event.target as Element).closest('[role="menu"]') !== panel) return
    const items = [...panel.querySelectorAll<HTMLElement>(ITEM_ROLES)]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => items[(i + items.length) % items.length]?.focus({ preventScroll: true })
    const back = isRtl(panel) ? 'ArrowRight' : 'ArrowLeft'
    if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey)) go(index + 1)
    else if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) go(index - 1)
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(items.length - 1)
    else if (event.key === back && side) onClose()
    else if (event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now()
      const key = event.key.toLowerCase()
      const text = (now - typed.current.at < 700 ? typed.current.text : '') + key
      // An item's own key (Mark unread's U) picks it, as it does on the message, unless I'm typing on toward an item's
      // name ("de" for Delete, though E is Edit's key); any other letter jumps.
      const label = (item: HTMLElement) => item.textContent?.trim().toLowerCase() ?? ''
      const typingOn = text.length > 1 && items.some((item) => label(item).startsWith(text))
      const picked = !typingOn && items.find((item) => item.getAttribute('aria-keyshortcuts')?.toLowerCase() === key)
      if (picked) {
        typed.current = { text: '', at: 0 }
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) picked.click()
        return
      }
      typed.current = { text, at: now }
      const order = [...items.slice(index + 1), ...items.slice(0, index + 1)]
      const match = order.find((item) => label(item).startsWith(text)) ?? order.find((item) => label(item).startsWith(text[0]))
      match?.focus({ preventScroll: true })
    } else return
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <SfPortal>
      {phone && !side && <div aria-hidden className="fixed inset-0 z-[var(--z-menu)] bg-sf-overlay" />}
      <div
        ref={panelRef}
        id={id}
        role="menu"
        aria-label={label}
        aria-orientation="vertical"
        data-sf-menu={rootId}
        onKeyDown={onKeyDown}
        style={phone ? undefined : pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
        className={clsx(
          'sf-ui fixed z-[var(--z-menu)] flex flex-col overflow-auto bg-sf-surface-raised py-2 text-sf-text shadow-sf-menu outline-none',
          phone
            ? 'inset-x-0 bottom-0 max-h-[80dvh] rounded-t-sf-lg pb-[max(8px,env(safe-area-inset-bottom))]'
            : 'max-h-[calc(100dvh-16px)] min-w-[260px] rounded-sf-lg',
        )}
      >
        {children}
      </div>
    </SfPortal>
  )
}

function itemClass(phone: boolean, danger: boolean) {
  return clsx(
    'sf-focus mx-2 flex flex-none cursor-pointer items-center gap-3 rounded-sf-md px-2 text-start whitespace-nowrap outline-none aria-disabled:cursor-default aria-disabled:text-sf-text-muted',
    phone ? 'h-11' : 'h-8',
    danger
      ? 'text-sf-accent hover:bg-sf-surface-mention focus:bg-sf-surface-mention'
      : 'text-sf-text hover:bg-sf-surface-hover focus:bg-sf-surface-hover',
  )
}

function focusOnHover(event: React.PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'touch' && document.activeElement !== event.currentTarget)
    event.currentTarget.focus({ preventScroll: true })
}

/** One menu row. `checked` makes it a radio item (sort, notification level) with a check at the end. */
export function MenuItem({
  icon,
  hint,
  shortcut,
  danger = false,
  disabled = false,
  checked,
  onSelect,
  keepOpen = false,
  children,
}: {
  icon?: TablerIcon
  /** Shortcut or trailing text, e.g. "S" or "⌘ Shift A". */
  hint?: ReactNode
  /** A one-letter key, e.g. "U": shown as the hint, announced (aria-keyshortcuts), and in the menu it picks the item. */
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  checked?: boolean
  onSelect?: () => void
  /** The menu stays open after it: the item closes it itself when its work lands (useCloseMenu), or shows why not. */
  keepOpen?: boolean
  children: ReactNode
}) {
  const { closeAll, phone } = useMenu()
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-keyshortcuts={shortcut}
      tabIndex={-1}
      onPointerMove={focusOnHover}
      onClick={() => {
        if (disabled) return
        onSelect?.()
        if (!keepOpen) closeAll()
      }}
      className={itemClass(phone, danger)}
    >
      {icon && <Icon icon={icon} size={18} className={danger ? 'text-sf-accent' : 'text-sf-text-secondary'} />}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {(hint ?? shortcut) && (
        <span aria-hidden={hint ? undefined : true} className="sf-meta ms-auto inline-flex items-center gap-1 ps-4 text-sf-text-muted">
          {hint ?? shortcut}
        </span>
      )}
      {checked && <Icon icon={IconCheck} size={18} className="ms-auto text-sf-accent" />}
    </button>
  )
}

/** A row that opens a nested menu to the end side (flips to the start when there is no room). */
export function Submenu({ icon, label, children }: { icon?: TablerIcon; label: string; children: ReactNode }) {
  const { phone } = useMenu()
  const [open, setOpen] = useState<false | 'first'>(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  // Moving to another row of the parent menu closes this one.
  useEffect(() => {
    if (!open) return
    const parent = buttonRef.current?.closest('[role="menu"]')
    const onFocusIn = (event: Event) => {
      if (event.target !== buttonRef.current) setOpen(false)
    }
    parent?.addEventListener('focusin', onFocusIn)
    return () => parent?.removeEventListener('focusin', onFocusIn)
  }, [open])

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus({ preventScroll: true })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open !== false}
        aria-controls={open ? id : undefined}
        tabIndex={-1}
        onPointerMove={(event) => {
          focusOnHover(event)
          if (event.pointerType !== 'touch') setOpen((o) => o || 'first')
        }}
        onClick={() => setOpen('first')}
        onKeyDown={(event) => {
          const forward = isRtl(event.currentTarget) ? 'ArrowLeft' : 'ArrowRight'
          if (event.key === forward) {
            event.preventDefault()
            event.stopPropagation()
            setOpen('first')
          }
        }}
        // The open submenu's row stays highlighted while focus is inside it.
        className={clsx(itemClass(phone, false), 'aria-expanded:bg-sf-surface-hover')}
      >
        {icon && <Icon icon={icon} size={18} className="text-sf-text-secondary" />}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Icon icon={IconChevronRight} size={18} flip className="ms-auto text-sf-text-muted" />
      </button>
      {open && (
        <MenuPanel id={id} label={label} anchorRef={buttonRef} side initialFocus={open} onClose={close}>
          {children}
        </MenuPanel>
      )}
    </>
  )
}

export function MenuSeparator() {
  return <div role="separator" className="my-2 h-px flex-none bg-sf-line" />
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div role="presentation" className="sf-label flex-none px-4 py-1 text-sf-text-muted">
      {children}
    </div>
  )
}
