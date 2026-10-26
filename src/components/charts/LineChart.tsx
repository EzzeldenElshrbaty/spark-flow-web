import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ChartTooltip, TooltipRow } from './ChartTooltip'
import { compactNumber, niceTicks } from './chartUtils'
import { useElementWidth } from './useElementWidth'

export type LineSeries = {
  key: string
  label: string
  color: string
  /** One value per x label; null where there is no data yet. */
  values: (number | null)[]
  /** A reference line (e.g. the target): dashed, no fill. */
  dashed?: boolean
  /** A light wash under the line (use on one series only). */
  area?: boolean
}

const MARGIN = { top: 12, right: 12, bottom: 26, left: 44 }

/**
 * Lines on one shared y-axis from zero. Pointer or arrow keys move a crosshair that shows every
 * series' value at that point.
 */
export function LineChart({
  labels,
  titles = labels,
  series,
  height = 220,
  format = (value) => value.toLocaleString('en-US'),
  label,
}: {
  labels: string[]
  /** Tooltip heading per point (defaults to the x label). */
  titles?: string[]
  series: LineSeries[]
  height?: number
  format?: (value: number) => string
  label: string
}) {
  const [ref, width] = useElementWidth()
  const [active, setActive] = useState<number | null>(null)
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const values = series.flatMap((item) => item.values.filter((value): value is number => value !== null))
  const ticks = niceTicks(Math.max(...values, 1), 4)
  const top = ticks[ticks.length - 1]
  const x = (index: number) => MARGIN.left + (labels.length === 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth)
  const y = (value: number) => MARGIN.top + plotHeight - (value / top) * plotHeight
  // Skip x labels so they never collide (about 44px each).
  const every = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor(plotWidth / 44))))

  const path = (list: (number | null)[]) =>
    list.reduce((d, value, index) => (value === null ? d : `${d}${d && list[index - 1] !== null ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`), '')
  const lastIndex = (list: (number | null)[]) => list.reduce<number>((last, value, index) => (value === null ? last : index), -1)

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const position = ((event.clientX - box.left - MARGIN.left) / (plotWidth || 1)) * (labels.length - 1)
    setActive(Math.max(0, Math.min(labels.length - 1, Math.round(position))))
  }
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowLeft' ? -1 : 1
    setActive((current) => Math.max(0, Math.min(labels.length - 1, (current ?? labels.length - 1) + step)))
  }

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label}. Use the left and right arrow keys to read each point.`}
          tabIndex={0}
          onPointerMove={onPointer}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((current) => current ?? labels.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
          className="touch-pan-y overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'} />
              <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-fg-muted text-[11px] tabular-nums">
                {compactNumber(tick)}
              </text>
            </g>
          ))}
          {labels.map((text, index) =>
            (labels.length - 1 - index) % every === 0 ? (
              <text key={text + index} x={x(index)} y={height - 8} textAnchor="middle" className="fill-fg-muted text-[11px]">
                {text}
              </text>
            ) : null,
          )}

          {series.map((item) =>
            item.area ? (
              <path
                key={`${item.key}-area`}
                d={`${path(item.values)}L${x(lastIndex(item.values))},${y(0)}L${x(item.values.findIndex((value) => value !== null))},${y(0)}Z`}
                fill={item.color}
                fillOpacity={0.1}
                className="motion-safe:animate-fade-in"
              />
            ) : null,
          )}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="var(--chart-axis)" />}
          {series.map((item) => (
            <path
              key={item.key}
              d={path(item.values)}
              fill="none"
              stroke={item.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              {...(item.dashed ? { strokeDasharray: '5 5', className: 'motion-safe:animate-fade-in' } : { pathLength: 1, strokeDasharray: 1, className: 'motion-safe:animate-draw' })}
            />
          ))}
          {series.map((item) => {
            const index = active ?? (item.dashed ? -1 : lastIndex(item.values))
            const value = item.values[index]
            if (index < 0 || value === null || value === undefined) return null
            return <circle key={`${item.key}-dot`} cx={x(index)} cy={y(value)} r={4} fill={item.color} stroke="var(--surface)" strokeWidth={2} />
          })}
        </svg>
      )}
      {active !== null && (
        <ChartTooltip x={x(active)} y={MARGIN.top} width={width} placement="beside" title={titles[active]}>
          {series.map((item) => {
            const value = item.values[active]
            return <TooltipRow key={item.key} color={item.color} dashed={item.dashed} label={item.label} value={value === null ? '—' : format(value)} />
          })}
        </ChartTooltip>
      )}
    </div>
  )
}
