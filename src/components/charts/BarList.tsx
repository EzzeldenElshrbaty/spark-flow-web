import { useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react'
import { ChartTooltip, TooltipRow } from '@/components/charts/ChartTooltip'
import { useElementWidth } from '@/components/charts/useElementWidth'

export type BarRow = {
  label: string
  value: number
  /** The value as shown at the end of the label line ("EGP 1.2M", "38"). */
  display: string
  color?: string
  /** Extra line under the label ("4 deals"). */
  note?: string
  /** A reference mark on this row's scale, e.g. where progress should be by today. */
  marker?: number
  /** Rows for the hover tooltip. */
  details?: { label: string; value: ReactNode; color?: string }[]
}

/**
 * Horizontal bars, one per row, each with its label and value above it. Bars grow from the left
 * baseline and end in a 4px rounded cap. Rows are focusable and show a tooltip.
 */
export function BarList({ rows, max, color = 'var(--chart-primary)', markerColor = 'var(--color-fg-secondary)' }: { rows: BarRow[]; max?: number; color?: string; markerColor?: string }) {
  const [ref, width] = useElementWidth()
  const [active, setActive] = useState<{ index: number; top: number } | null>(null)
  // The tooltip sits on the top edge of the hovered row's bar (the bar is the row's last 12px).
  const show = (index: number) => (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) =>
    setActive({ index, top: event.currentTarget.offsetTop + event.currentTarget.offsetHeight - 12 })
  const scale = max ?? Math.max(1, ...rows.map((row) => Math.max(row.value, row.marker ?? 0)))
  const share = (value: number) => Math.max(0, Math.min(100, (value / scale) * 100))
  const activeRow = active === null ? null : rows[active.index]

  return (
    <div ref={ref} className="relative">
      <ul className="space-y-3.5">
        {rows.map((row, index) => (
          <li
            key={row.label}
            tabIndex={0}
            onMouseEnter={show(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={show(index)}
            onBlur={() => setActive(null)}
            className="group -mx-2 rounded-md px-2 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label={`${row.label}: ${row.display}${row.note ? `, ${row.note}` : ''}`}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium text-fg-secondary">
                {row.label}
                {row.note && <span className="font-normal text-fg-subtle"> · {row.note}</span>}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-fg">{row.display}</span>
            </div>
            <div className="relative h-2.5">
              {row.value > 0 && (
                <div
                  className="h-full origin-left rounded-r-[4px] transition-opacity group-hover:opacity-85 motion-safe:animate-grow-x"
                  style={{ width: `max(3px, ${share(row.value)}%)`, background: row.color ?? color, animationDelay: `${index * 50}ms` }}
                />
              )}
              {row.marker !== undefined && (
                <span className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full" style={{ left: `${share(row.marker)}%`, background: markerColor }} />
              )}
            </div>
          </li>
        ))}
      </ul>
      {activeRow?.details && (
        <ChartTooltip x={(share(activeRow.value) / 100) * width} y={active!.top} width={width} title={activeRow.label}>
          {activeRow.details.map((detail) => (
            <TooltipRow key={detail.label} {...detail} />
          ))}
        </ChartTooltip>
      )}
    </div>
  )
}
