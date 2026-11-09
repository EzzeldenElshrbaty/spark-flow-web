import clsx from 'clsx'

/** A progress bar. Red is for late work (UX Phase 3, 3.3): `neutral` on time, `danger` behind, `success` done. */
export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'neutral' | 'danger' | 'success' | 'warning' }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={clsx('h-full rounded-full', {
          'bg-brand-500': tone === 'brand',
          'bg-fg-tertiary': tone === 'neutral',
          'bg-red-600': tone === 'danger',
          'bg-emerald-500': tone === 'success',
          'bg-amber-500': tone === 'warning',
        })}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
