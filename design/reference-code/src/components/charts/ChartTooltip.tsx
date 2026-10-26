import type { ReactNode } from 'react'

/**
 * Tooltip inside a chart's `relative` box. `above` the point (x, y), it slides from left-anchored to
 * right-anchored across the width so it never spills out of the card; `beside` it sits next to a
 * crosshair, on whichever side has more room.
 */
export function ChartTooltip({
  x,
  y,
  width,
  title,
  placement = 'above',
  children,
}: {
  x: number
  y: number
  width: number
  title: ReactNode
  placement?: 'above' | 'beside'
  children?: ReactNode
}) {
  const shift = width > 0 ? Math.max(0, Math.min(100, (x / width) * 100)) : 50
  const transform =
    placement === 'beside' ? (x < width / 2 ? 'translateX(12px)' : 'translateX(calc(-100% - 12px))') : `translate(-${shift}%, calc(-100% - 10px))`
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-32 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg motion-safe:animate-fade-in"
      style={{ left: x, top: y, transform }}
    >
      <p className="mb-1 font-semibold whitespace-nowrap text-fg">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

export function TooltipRow({ color, label, value, dashed }: { color?: string; label: string; value: ReactNode; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {color && (dashed ? <span className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: color }} /> : <span className="size-2 rounded-sm" style={{ background: color }} />)}
      <span className="text-fg-muted">{label}</span>
      <span className="ml-auto pl-3 font-medium tabular-nums text-fg">{value}</span>
    </div>
  )
}
