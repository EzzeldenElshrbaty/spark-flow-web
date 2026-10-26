/** A small trend line for a KPI tile: shape only, the numbers are in the tile's text. */
export function Sparkline({ values, color = 'var(--chart-primary)', className }: { values: number[]; color?: string; className?: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const points = values.map((value, index) => [(index / (values.length - 1)) * 100, 28 - ((value - min) / range) * 24] as const)
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={className} aria-hidden>
      <path d={`${line} L100,32 L0,32 Z`} fill={color} fillOpacity={0.1} className="motion-safe:animate-fade-in" />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="motion-safe:animate-fade-in" />
    </svg>
  )
}
