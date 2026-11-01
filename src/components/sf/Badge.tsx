import type { TablerIcon } from '@tabler/icons-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

/** Red count pill (mentions, unread). `label` is read after the number, e.g. "3 mentions". */
export function Count({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-grid h-[18px] min-w-5 flex-none place-items-center rounded-sf-full bg-sf-accent-fill px-1 font-sf text-[12px]/[18px] font-semibold text-sf-on-accent tabular-nums',
        className,
      )}
    >
      {value > 99 ? '99+' : value}
      <span className="sr-only"> {label}</span>
    </span>
  )
}

/** Small label: App, Guest, External, task states. */
export function Tag({
  tone = 'default',
  icon,
  children,
}: {
  tone?: 'default' | 'accent'
  icon?: TablerIcon
  children: ReactNode
}) {
  return (
    <span
      className={clsx(
        'inline-flex h-5 flex-none items-center gap-1 rounded-sf-sm border px-1 font-sf text-[12px]/[16px] font-medium',
        tone === 'accent'
          ? 'border-transparent bg-sf-surface-mention text-sf-accent'
          : 'border-sf-line bg-sf-surface-hover text-sf-text-secondary',
      )}
    >
      {icon && <Icon icon={icon} size={14} />}
      {children}
    </span>
  )
}

/** A key hint. `onDark` for tooltips and other ink-950 surfaces. */
export function Kbd({ onDark = false, children }: { onDark?: boolean; children: ReactNode }) {
  return (
    <kbd
      className={clsx(
        'inline-grid h-5 min-w-5 flex-none place-items-center rounded-sf-sm border px-1 font-sf text-[12px]/[16px] font-medium',
        onDark
          ? 'border-sf-ink-600 bg-sf-ink-800 text-sf-ink-100'
          : 'border-sf-line bg-sf-surface-sunken text-sf-text-secondary',
      )}
    >
      {children}
    </kbd>
  )
}
