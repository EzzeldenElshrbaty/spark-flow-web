import type { TablerIcon } from '@tabler/icons-react'
import clsx from 'clsx'
import { useRef, type KeyboardEvent } from 'react'
import { Icon } from './Icon'

export type TabItem<T extends string> = { id: T; label: string; icon?: TablerIcon }

/**
 * The 40px tab row under a header (spec 6.1, 6.12). Arrow keys move to the next tab and open it (one tab stop for the
 * row); Home and End go to the ends. `panelId` is the tab panel the tabs control.
 */
export function Tabs<T extends string>({ label, tabs, tab, onChange, panelId }: { label: string; tabs: TabItem<T>[]; tab: T; onChange: (tab: T) => void; panelId: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key]
    const next = step !== undefined ? (index + step + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    refs.current[next]?.focus()
    onChange(tabs[next].id)
  }
  return (
    // The row's line is an inset shadow, inside its box: the selected tab's rule covers it without the row scrolling.
    <div role="tablist" aria-label={label} className="flex h-sf-tabs flex-none items-stretch gap-1 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--line)]">
      {tabs.map((t, i) => {
        const selected = t.id === tab
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              'sf-focus sf-ui-medium relative inline-flex items-center gap-2 px-2 whitespace-nowrap hover:text-sf-text',
              // The 2px accent rule sits on the row's bottom line (spec 6.1).
              'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-[2px]',
              selected ? 'text-sf-text after:bg-sf-accent-fill' : 'text-sf-text-secondary after:bg-transparent',
            )}
          >
            {t.icon && <Icon icon={t.icon} size={18} />}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
