import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useLayoutEffect, useState, type RefObject } from 'react'
import { IconButton } from '@/components/ui/IconButton'

/** Which of a sideways strip's columns (its `<section>` children) are wholly in view, 1-based. */
export type ColumnStrip = { first: number; last: number; total: number; overflows: boolean; atStart: boolean; atEnd: boolean; step: (dir: 1 | -1) => void }

const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * The board's columns as a strip (UX Phase 4, 4.1): which ones show, whether there's more either way, and a step of
 * one column. `count` re-measures when columns come or go. Works right to left too.
 */
export function useColumnStrip(ref: RefObject<HTMLElement | null>, count: number): ColumnStrip {
  const [seen, setSeen] = useState({ first: 1, last: 1, total: 0, overflows: false, atStart: true, atEnd: true })
  const measure = useCallback(() => {
    const box = ref.current
    if (!box) return
    const sections = [...box.children].filter((el) => el.tagName === 'SECTION')
    const view = box.getBoundingClientRect()
    const whole = sections.flatMap((el, i) => {
      const r = el.getBoundingClientRect()
      return r.left >= view.left - 1 && r.right <= view.right + 1 ? [i + 1] : []
    })
    const offset = Math.abs(box.scrollLeft)
    const spare = box.scrollWidth - box.clientWidth
    setSeen({
      first: whole[0] ?? 1,
      last: whole.at(-1) ?? whole[0] ?? 1,
      total: sections.length,
      // Some column isn't wholly in view: the Add column tile alone past the edge doesn't count (UX Phase 6).
      overflows: spare > 1 && whole.length < sections.length,
      atStart: offset < 1,
      atEnd: spare - offset < 1,
    })
  }, [ref])
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    measure()
    box.addEventListener('scroll', measure, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(box)
    return () => {
      box.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [ref, measure, count])
  const step = (dir: 1 | -1) => {
    const box = ref.current
    const column = box?.querySelector(':scope > section')
    if (!box || !column) return
    const style = getComputedStyle(box)
    const width = column.getBoundingClientRect().width + (parseFloat(style.columnGap) || 0)
    box.scrollBy({ left: dir * (style.direction === 'rtl' ? -1 : 1) * width, behavior: still() ? 'auto' : 'smooth' })
  }
  return { ...seen, step }
}

/** "Columns 2–4 of 6" over the board while some are out of view, and from md the arrows to them. */
export function ColumnStripBar({ strip }: { strip: ColumnStrip }) {
  if (!strip.overflows) return null
  const { first, last, total } = strip
  return (
    <div className="mb-2 flex items-center justify-end gap-2">
      <span className="text-xs text-fg-muted tabular-nums">{last > first ? `Columns ${first}–${last} of ${total}` : `Column ${first} of ${total}`}</span>
      <div className="hidden gap-1 md:flex">
        <IconButton label="Earlier columns" icon={ChevronLeft} size="sm" disabled={strip.atStart} onClick={() => strip.step(-1)} className="rtl:[&_svg]:-scale-x-100" />
        <IconButton label="Later columns" icon={ChevronRight} size="sm" disabled={strip.atEnd} onClick={() => strip.step(1)} className="rtl:[&_svg]:-scale-x-100" />
      </div>
    </div>
  )
}
