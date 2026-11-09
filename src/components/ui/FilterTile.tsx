import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'

const tones = {
  red: 'text-red-600 dark:text-red-400',
  amber: 'text-amber-600 dark:text-amber-400',
  sky: 'text-sky-600 dark:text-sky-400',
  neutral: 'text-fg-muted',
}

/**
 * An attention tile that filters its list (kit pattern A.2, UX Phase 4): pressed while its filter is on; clicking a
 * pressed tile clears it. Red for overdue, amber for waiting, sky for due today. The count is a dash while it loads.
 */
export function FilterTile({
  label,
  count,
  icon: Icon,
  tone,
  pressed,
  onClick,
  disabled = false,
}: {
  label: string
  count: number | undefined
  icon: LucideIcon
  tone: keyof typeof tones
  pressed: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex items-center gap-3 rounded-xl border bg-surface p-3 text-start shadow-sm transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 sm:p-4',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:outline-brand-400',
        pressed ? 'border-brand-500 ring-2 ring-accent-soft' : 'border-line hover:border-line-strong',
      )}
    >
      <span className={clsx('rounded-lg bg-surface-muted p-2', tones[tone])}>
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-semibold tabular-nums text-fg">{count ?? '–'}</span>
        <span className="block truncate text-xs text-fg-muted">{label}</span>
      </span>
    </button>
  )
}
