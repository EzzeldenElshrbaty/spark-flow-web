import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { CountUp } from '../../components/charts/CountUp'
import { ProgressRing } from '../../components/charts/ProgressRing'
import { Sparkline } from '../../components/charts/Sparkline'
import { Card } from '../../components/ui/Card'

export type StatDelta = {
  previous: number
  /** Whether a rise is good news (pipeline) or bad news (SLA breaches). */
  goodWhen?: 'up' | 'down'
  /** percent: relative change; points: difference of two percentages; count: difference. */
  unit?: 'percent' | 'points' | 'count'
  compareLabel: string
}

/**
 * A KPI tile: the number (counting up), how it moved against the previous period, and its shape over
 * the period. `ring` shows progress toward a target instead of an icon.
 */
export function StatCard({
  label,
  value,
  format,
  hint,
  icon: Icon,
  delta,
  trend,
  ring,
  alert,
}: {
  label: string
  value: number
  format?: (value: number) => string
  hint?: ReactNode
  icon?: LucideIcon
  delta?: StatDelta
  trend?: number[]
  ring?: number
  /** Draws attention to the icon (e.g. overdue work). */
  alert?: boolean
}) {
  return (
    <Card className="flex h-full min-w-0 flex-col overflow-hidden p-4 motion-safe:animate-fade-up sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-fg-muted sm:text-sm">{label}</p>
        {Icon && ring === undefined && (
          <span
            className={clsx(
              'hidden rounded-lg p-2 sm:block',
              alert ? 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400' : 'bg-accent-soft text-accent',
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xl font-semibold tracking-tight text-fg tabular-nums sm:text-2xl">
          <CountUp value={value} format={format} />
        </p>
        {ring !== undefined && <ProgressRing value={ring} label={`${ring}% of target`} />}
      </div>
      {delta && <DeltaLine value={value} {...delta} />}
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
      {trend && <Sparkline values={trend} className="mt-auto h-8 w-full pt-3" />}
    </Card>
  )
}

function DeltaLine({ value, previous, goodWhen = 'up', unit = 'percent', compareLabel }: { value: number } & StatDelta) {
  const difference = value - previous
  let text: string
  if (difference === 0) text = 'No change'
  else if (unit === 'points') text = `${Math.abs(difference)} pts`
  else if (unit === 'count') text = Math.abs(difference).toLocaleString('en-US')
  else if (previous === 0) text = 'New'
  else text = `${Math.abs(Math.round((difference / previous) * 100))}%`
  const better = goodWhen === 'up' ? difference > 0 : difference < 0
  const Arrow = difference > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <p className="mt-1 flex min-w-0 items-center gap-1 text-xs">
      {difference === 0 ? (
        <span className="font-medium text-fg-tertiary">{text}</span>
      ) : (
        <span className={clsx('inline-flex shrink-0 items-center font-semibold', better ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
          <Arrow className="size-3.5" aria-hidden />
          <span className="sr-only">{difference > 0 ? 'Up' : 'Down'} </span>
          {text}
        </span>
      )}
      <span className="truncate text-fg-muted">vs {compareLabel}</span>
    </p>
  )
}
