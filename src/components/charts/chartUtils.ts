// Helpers shared by the chart components.

/** A chart's data as a plain table: every chart can be read as one ("View as table"). */
export type ChartTableData = { columns: string[]; rows: (string | number)[][] }

/** Series colours come from the chart tokens in index.css, so each theme has its own validated steps. */
export const chartColors = {
  primary: 'var(--chart-primary)',
  context: 'var(--chart-context)',
  egypt: 'var(--chart-egypt)',
  saudi: 'var(--chart-saudi)',
} as const

/** Ordered steps for ordered categories (funnel steps, deal stages): later steps are stronger. */
export function stepColor(index: number, count: number) {
  const step = count <= 1 ? 5 : Math.round(1 + (index / (count - 1)) * 4)
  return `var(--chart-step-${step})`
}

/** Colour per market: it follows the market, never its position in a list. */
export const marketColor = (marketId: string) => (marketId === 'sa' ? chartColors.saudi : marketId === 'eg' ? chartColors.egypt : chartColors.context)

/** Round axis ticks from 0: at most `count` + 1 steps of 1, 2 or 5 × 10ⁿ. */
export function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1]
  const rough = max / count
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough)!
  const ticks: number[] = []
  for (let tick = 0; tick < max + step * 0.001; tick += step) ticks.push(tick)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

/** 1.2K, 3.4M: for axis ticks. */
export const compactNumber = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
