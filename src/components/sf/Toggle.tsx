import { IconCheck } from '@tabler/icons-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

/** On/off switch. Give it `label` when no visible text names it, or `labelledBy`. */
export function Toggle({
  checked,
  onChange,
  label,
  labelledBy,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  labelledBy?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'sf-focus relative h-5 w-9 flex-none cursor-pointer rounded-sf-full border-0 p-0 transition-colors duration-150 ease-sf disabled:cursor-not-allowed',
        checked ? 'bg-sf-accent-fill' : 'bg-sf-line-strong',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'absolute start-0.5 top-0.5 size-4 rounded-sf-full bg-sf-white transition-transform duration-150 ease-sf',
          checked && 'translate-x-4 rtl:-translate-x-4',
        )}
      />
    </button>
  )
}

/** Native checkbox with the redesign's 16px box; the whole label is the click target. */
export function Checkbox({
  checked,
  onChange,
  children,
  disabled = false,
  title,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  disabled?: boolean
  /** Shown on hover: why it's off, say (the task list's checkbox). */
  title?: string
  className?: string
}) {
  return (
    <label
      title={title}
      className={clsx(
        'sf-small inline-flex items-center gap-2 text-sf-text-secondary',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden
        className={clsx(
          'inline-grid size-4 flex-none place-items-center rounded-sf-sm border text-sf-on-accent peer-focus-visible:shadow-[var(--focus-ring)]',
          checked ? 'border-sf-accent-fill bg-sf-accent-fill' : 'border-sf-line-strong bg-sf-surface',
        )}
      >
        {checked && <Icon icon={IconCheck} size={14} />}
      </span>
      {children}
    </label>
  )
}
