import clsx from 'clsx'
import type { ReactNode } from 'react'

/** Shared look for inputs, selects and textareas. */
export const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:opacity-60 aria-invalid:border-red-500'

/** Selects: same box as inputs, with our chevron and room for it on the right. */
export const selectClass = `${inputClass} select-chevron cursor-pointer pe-9`

/** A select sized by the page, in a row of filters (UX Phase 4): `selectClass` without its full width. */
export const selectInlineClass = selectClass.replace('w-full ', '')

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-fg-secondary">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-fg-muted">{hint}</span>
      )}
    </label>
  )
}
