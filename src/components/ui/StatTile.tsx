import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * One stat tile (UX Phase 3, 3.5), in the kit StatCard's look: the label, the number, an optional line under it. The
 * label and the value stay siblings (a screen reader reads them together). `tone="danger"` makes the number red;
 * `icon` sits in the corner in `iconTone`; `to` makes the tile open its page; `children` go last (a progress bar).
 */
export function StatTile({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  iconTone = 'bg-accent-soft text-accent',
  to,
  children,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: 'danger'
  icon?: LucideIcon
  iconTone?: string
  to?: string
  children?: ReactNode
}) {
  const body = (
    <>
      <p className={clsx('text-xs text-fg-muted sm:text-sm', Icon && 'pe-8')}>{label}</p>
      <p className={clsx('mt-1 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl', tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-fg')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
      {Icon && (
        <span aria-hidden className={clsx('absolute end-3 top-3 rounded-md p-1 sm:end-4 sm:top-4', iconTone)}>
          <Icon className="size-3.5" />
        </span>
      )}
      {children}
    </>
  )
  const tile = 'relative block h-full min-w-0 rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5'
  return to ? (
    <Link to={to} className={clsx(tile, 'transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:focus-visible:outline-brand-400')}>
      {body}
    </Link>
  ) : (
    <div className={tile}>{body}</div>
  )
}
