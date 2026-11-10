import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: LucideIcon; iconOnlyOnPhone?: boolean }

// The kit's kinds (design/03-components.md "Tabs & segmented controls"): B for a view or period switch, D inside forms.
const kinds = {
  switch: {
    track: 'inline-flex rounded-lg bg-surface-muted p-0.5 ring-1 ring-line',
    item: 'px-2.5 py-1.5 font-medium',
    on: 'bg-surface text-fg shadow-sm ring-1 ring-line',
    off: 'text-fg-tertiary hover:text-fg', // on the tinted track: 6.9:1 (UX Phase 5B, 5.8)
  },
  form: {
    track: 'inline-flex rounded-lg border border-line p-0.5',
    item: 'px-3 py-1',
    on: 'bg-surface-muted font-medium text-fg',
    off: 'text-fg-muted hover:text-fg',
  },
}

/**
 * One segmented control (UX Phase 3, 3.5): a radio group with one tab stop; the arrow keys move the choice along it,
 * wrapping. `kind="switch"` is the raised pill on a muted track (Board / List, a period), `form` the bordered one.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  kind = 'switch',
  disabled = false,
}: {
  label: string
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  kind?: keyof typeof kinds
  disabled?: boolean
}) {
  const look = kinds[kind]
  const chosen = Math.max(0, options.findIndex((o) => o.value === value))
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const at = (index + step + options.length) % options.length
    onChange(options[at]!.value)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=radio]')[at]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className={look.track}>
      {options.map(({ value: option, label: text, icon: Icon, iconOnlyOnPhone }, index) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          tabIndex={index === chosen ? 0 : -1}
          disabled={disabled}
          onClick={() => option !== value && onChange(option)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-md text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:focus-visible:outline-brand-400 disabled:cursor-default',
            look.item,
            option === value ? look.on : look.off,
          )}
        >
          {Icon && <Icon aria-hidden className="size-4" />}
          <span className={clsx(iconOnlyOnPhone && Icon && 'max-sm:sr-only')}>{text}</span>
        </button>
      ))}
    </div>
  )
}
