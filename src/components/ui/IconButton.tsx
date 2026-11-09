import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, Ref } from 'react'

/**
 * A button that shows only an icon, in the kit look (UX Phase 3, 3.5). Its label is its accessible name and its
 * tooltip (kit rule: every icon-only button has both). `md` is 36px, `sm` 32px; `touch` makes it 44px on phones.
 */
export function IconButton({
  label,
  icon: Icon,
  size = 'md',
  tone = 'default',
  touch = false,
  className,
  type = 'button',
  ref,
  title,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  label: string
  /** The tooltip when it says more than the name (a shortcut); the label otherwise. */
  title?: string
  icon: LucideIcon
  size?: 'md' | 'sm'
  tone?: 'default' | 'danger'
  touch?: boolean
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg aria-pressed:bg-surface-muted aria-pressed:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:focus-visible:outline-brand-400 disabled:pointer-events-none disabled:opacity-40',
        size === 'md' ? 'size-9' : 'size-8',
        touch && 'max-sm:size-11',
        tone === 'danger' && 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400',
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  )
}
