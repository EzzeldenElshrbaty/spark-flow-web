import clsx from 'clsx'
import { cloneElement, isValidElement, useId, type ReactNode } from 'react'

/** Shared look for inputs, selects and textareas. */
export const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:opacity-60 aria-invalid:border-red-500'

/** Selects: same box as inputs, with our chevron and room for it on the right. */
export const selectClass = `${inputClass} select-chevron cursor-pointer pe-9`

/** A select sized by the page, in a row of filters (UX Phase 4): `selectClass` without its full width. */
export const selectInlineClass = selectClass.replace('w-full ', '')

/**
 * A labelled form control. The label names the control alone; with `required` the control says so and the " *" isn't
 * read; the error (or else the hint) sits under it and is read as its description (UX Phase 5A, 5.9). Its child is the
 * native control.
 */
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
  const id = useId()
  const noteId = error || hint ? `${id}-note` : undefined
  const control = isValidElement<{ 'aria-describedby'?: string; 'aria-required'?: boolean }>(children)
    ? cloneElement(children, {
        'aria-describedby': [children.props['aria-describedby'], noteId].filter(Boolean).join(' ') || undefined,
        ...(required && { 'aria-required': true }),
      })
    : children
  return (
    <div className={clsx('block', className)}>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-fg-secondary">
          {label}
          {required && (
            <span className="text-accent" aria-hidden>
              {' '}
              *
            </span>
          )}
        </span>
        {control}
      </label>
      {error ? (
        <span id={noteId} className="mt-1 block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : (
        hint && (
          <span id={noteId} className="mt-1 block text-xs text-fg-muted">
            {hint}
          </span>
        )
      )}
    </div>
  )
}
