import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export type Stage = {
  id: string
  label: string
  /** Small line inside the segment: when a done step happened, or how long the current one has run. */
  meta?: string
}

/**
 * - `active`: work in progress at `current`.
 * - `done`: every stage complete (e.g. a lead converted).
 * - `paused`: parked at `current` (amber), e.g. not now, or on hold.
 * - `stopped`: ended at `current` without finishing (grey, red stop), e.g. disqualified.
 */
export type StageState = 'active' | 'done' | 'paused' | 'stopped'

const ARROW = '12px'
/** Chevron shapes: arrow tips between segments; the first starts flat and the last ends flat. */
function shape(index: number, count: number, delay: number): CSSProperties {
  const tip = index < count - 1 ? `calc(100% - ${ARROW}) 0, 100% 50%, calc(100% - ${ARROW}) 100%` : '100% 0, 100% 100%'
  const notch = index > 0 ? `, ${ARROW} 50%` : ''
  return { clipPath: `polygon(0 0, ${tip}, 0 100%${notch})`, animationDelay: `${delay}ms` }
}

/**
 * A business-process bar: one slim row of arrow segments across the full width, filled up to the
 * current stage. Clicking a segment opens a small panel with that stage's details (`renderDetails`).
 * Phones get a compact "Stage 3 of 4" line with a thin segmented bar. Reusable for any ordered stages.
 */
export function StageProgress({
  stages,
  current,
  state = 'active',
  tag,
  label = 'Progress',
  stopLabel = 'Stopped',
  renderDetails,
}: {
  stages: Stage[]
  /** Index of the stage reached. */
  current: number
  state?: StageState
  /** A small status line under the bar (e.g. converted link, disqualified reason, follow-up date). */
  tag?: ReactNode
  label?: string
  /** What the stopped segment says, e.g. "Disqualified". */
  stopLabel?: string
  renderDetails?: (stage: Stage, index: number) => ReactNode
}) {
  const count = stages.length
  const reached = state === 'done' ? count - 1 : Math.min(Math.max(current, 0), count - 1)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (openIndex === null) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenIndex(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenIndex(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openIndex])

  const kindOf = (index: number) => {
    if (state === 'done' || index < reached) return state === 'stopped' ? 'done-stopped' : 'done'
    if (index === reached) return state === 'stopped' ? 'stop' : state === 'paused' ? 'paused' : 'current'
    return 'upcoming'
  }

  const segmentClass = {
    done: 'bg-brand-500 text-white',
    'done-stopped': 'bg-surface-strong text-fg-secondary',
    current: 'bg-brand-100 font-semibold text-brand-800 dark:bg-brand-500/25 dark:text-brand-100',
    paused: 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100',
    stop: 'bg-red-100 font-semibold text-red-800 dark:bg-red-500/20 dark:text-red-100',
    upcoming: 'bg-surface-muted text-fg-muted',
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Tablets and desktops: arrow segments. */}
      <ol className="hidden h-11 gap-1 sm:flex" aria-label={label}>
        {stages.map((stage, index) => {
          const kind = kindOf(index)
          const isCurrent = index === reached && state !== 'done'
          const text = kind === 'stop' ? stopLabel : stage.label
          return (
            <li key={stage.id} className="min-w-0 flex-1" aria-current={isCurrent ? 'step' : undefined}>
              <button
                type="button"
                onClick={() => renderDetails && setOpenIndex(openIndex === index ? null : index)}
                aria-expanded={renderDetails ? openIndex === index : undefined}
                title={[text, stage.meta].filter(Boolean).join(' · ')}
                style={shape(index, count, index * 70)}
                className={clsx(
                  'relative flex size-full items-center justify-center gap-1.5 overflow-hidden text-sm transition-colors duration-500 motion-safe:animate-fade-in',
                  index === 0 ? 'ps-3 pe-5' : 'px-5',
                  segmentClass[kind],
                  renderDetails && 'cursor-pointer hover:brightness-95',
                )}
              >
                {/* A slow light sweep across the stage that's in progress. */}
                {kind === 'current' && <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent motion-safe:animate-shimmer dark:via-white/10" aria-hidden />}
                {(kind === 'done' || kind === 'done-stopped') && <Check className="size-4 shrink-0" strokeWidth={2.5} />}
                <span className="relative min-w-0 truncate">{text}</span>
                {stage.meta && <span className="relative hidden shrink-0 text-xs font-normal opacity-75 lg:inline">{stage.meta}</span>}
              </button>
            </li>
          )
        })}
      </ol>

      {/* Phones: the current stage in words and a thin segmented bar. */}
      <div className="sm:hidden" aria-label={label}>
        <p className="flex items-baseline justify-between gap-2 text-sm">
          <span className={clsx('font-semibold', state === 'stopped' ? 'text-red-700 dark:text-red-300' : state === 'paused' ? 'text-amber-700 dark:text-amber-300' : 'text-fg')}>
            {state === 'stopped' ? stopLabel : stages[reached].label}
          </span>
          <span className="text-xs text-fg-muted">
            Stage {reached + 1} of {count}
            {stages[reached].meta ? ` · ${stages[reached].meta}` : ''}
          </span>
        </p>
        <div className="mt-2 flex gap-1">
          {stages.map((stage, index) => {
            const kind = kindOf(index)
            return (
              <span
                key={stage.id}
                className={clsx(
                  'h-1.5 flex-1 rounded-full transition-colors duration-500',
                  kind === 'done' ? 'bg-brand-500' : kind === 'current' ? 'bg-brand-300' : kind === 'paused' ? 'bg-amber-400' : kind === 'stop' ? 'bg-red-400' : kind === 'done-stopped' ? 'bg-fg-subtle' : 'bg-surface-strong',
                )}
              />
            )
          })}
        </div>
      </div>

      {tag && <div className="mt-2 flex flex-wrap items-center justify-end gap-2">{tag}</div>}

      {renderDetails && openIndex !== null && (
        <div
          className="absolute top-12 z-20 hidden w-72 rounded-xl border border-line bg-surface p-4 text-sm shadow-xl motion-safe:animate-pop-in sm:block"
          style={{ left: `clamp(0px, calc(${(openIndex / count) * 100}% ), calc(100% - 18rem))` }}
          role="dialog"
          aria-label={`${stages[openIndex].label} details`}
        >
          {renderDetails(stages[openIndex], openIndex)}
        </div>
      )}
    </div>
  )
}
