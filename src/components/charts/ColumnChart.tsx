import clsx from 'clsx'
import { useState } from 'react'
import { ChartTooltip, TooltipRow } from '@/components/charts/ChartTooltip'
import { niceTicks } from '@/components/charts/chartUtils'
import { useElementWidth } from '@/components/charts/useElementWidth'

export type ColumnSeries = { key: string; label: string; color: string }
export type Column = { label: string; title: string; values: Record<string, number>; highlight?: boolean }

const PLOT_HEIGHT = 160

/**
 * Columns stacked from a shared baseline, bottom to top in `series` order, with a 2px surface gap
 * between segments and a 4px rounded top. Hover or focus a column for its numbers.
 */
export function ColumnChart({
  columns,
  series,
  label,
  format = (value) => value.toLocaleString('en-US'),
  tickFormat = format,
}: {
  columns: Column[]
  series: ColumnSeries[]
  label: string
  /** How values read in the tooltip (e.g. money). */
  format?: (value: number) => string
  /** How the axis ticks read; short forms like 1.2M fit best. */
  tickFormat?: (value: number) => string
}) {
  const [ref, width] = useElementWidth()
  const [active, setActive] = useState<number | null>(null)
  const totals = columns.map((column) => series.reduce((sum, item) => sum + (column.values[item.key] ?? 0), 0))
  const ticks = niceTicks(Math.max(...totals, 1), 3)
  const top = ticks[ticks.length - 1]
  const height = (value: number) => (value / top) * PLOT_HEIGHT
  // Narrow screens label every other column, counting back from the last.
  const sparse = width > 0 && width / columns.length < 30

  return (
    <div className="flex gap-2 pt-3" role="group" aria-label={label}>
      <div className="relative min-w-6 shrink-0 text-right text-[11px] tabular-nums text-fg-muted" style={{ height: PLOT_HEIGHT }} aria-hidden>
        {ticks.map((tick) => (
          <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ bottom: height(tick) }}>
            {tickFormat(tick)}
          </span>
        ))}
      </div>
      <div ref={ref} className="relative min-w-0 flex-1">
        <div className="relative" style={{ height: PLOT_HEIGHT }}>
          {ticks.map((tick) => (
            <span key={tick} className={clsx('absolute inset-x-0 h-px', tick === 0 ? 'bg-chart-axis' : 'bg-chart-grid')} style={{ bottom: height(tick) }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex">
            {columns.map((column, index) => (
              <div
                key={column.title}
                tabIndex={0}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                aria-label={`${column.title}: ${series.map((item) => `${column.values[item.key] ?? 0} ${item.label}`).join(', ')}`}
                className={clsx('flex h-full flex-1 items-end justify-center rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500', active === index && 'bg-surface-muted/70')}
              >
                <div className="flex w-full max-w-6 origin-bottom flex-col-reverse gap-0.5 px-[3px] motion-safe:animate-grow-y" style={{ animationDelay: `${index * 25}ms` }}>
                  {series.map((item, at) => {
                    const value = column.values[item.key] ?? 0
                    if (!value) return null
                    const isTop = series.slice(at + 1).every((next) => !column.values[next.key])
                    return <div key={item.key} className={clsx(isTop && 'rounded-t-[4px]')} style={{ height: Math.max(2, height(value) - 2), background: item.color }} />
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex text-[11px] text-fg-muted" aria-hidden>
          {columns.map((column, index) => (
            <span key={column.title} className={clsx('flex-1 text-center', column.highlight && 'font-semibold text-fg-secondary', sparse && (columns.length - 1 - index) % 2 === 1 && 'invisible')}>
              {column.label}
            </span>
          ))}
        </div>
        {active !== null && (
          <ChartTooltip x={((active + 0.5) / columns.length) * width} y={PLOT_HEIGHT - height(totals[active])} width={width} title={columns[active].title}>
            {[...series].reverse().map((item) => (
              <TooltipRow key={item.key} color={item.color} label={item.label} value={format(columns[active].values[item.key] ?? 0)} />
            ))}
            {series.length > 1 && <TooltipRow label="Total" value={format(totals[active])} />}
          </ChartTooltip>
        )}
      </div>
    </div>
  )
}
