import clsx from 'clsx'

/**
 * On/off switch in the kit look (UX Phase 3, 3.1): a 40×24 track, brand red when on, the strong surface when off, the
 * surface for the thumb. Named by `label`, or by the words beside it through `labelledBy`.
 */
export function Switch({
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
        'relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full p-0.5 ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:focus-visible:outline-brand-400 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand-500 ring-brand-500' : 'bg-surface-strong ring-line-strong',
      )}
    >
      <span aria-hidden className={clsx('size-5 rounded-full bg-surface shadow-sm transition-transform motion-reduce:transition-none', checked && 'translate-x-4 rtl:-translate-x-4')} />
    </button>
  )
}
