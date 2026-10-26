import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTrackedLoading } from '@/lib/loading'

/** Loads quicker than this never show the bar, so instant pages don't flicker. */
const showAfterMs = 200

type Phase = 'idle' | 'loading' | 'done'

/**
 * A thin Spark-red line across the top of the page while data loads or saves. It creeps towards
 * the end while waiting, then fills and fades once everything is in. Background refreshes marked
 * `meta: { silent: true }` (the bell's once-a-minute check) don't show it.
 */
export function LoadingBar() {
  const fetching = useIsFetching({ predicate: (query) => query.meta?.silent !== true })
  const saving = useIsMutating()
  const tracked = useTrackedLoading()
  const busy = fetching + saving > 0 || tracked
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    if (busy && phase !== 'loading') {
      // Something new started while the last bar was fading: carry on straight away.
      const timer = setTimeout(() => setPhase('loading'), phase === 'done' ? 0 : showAfterMs)
      return () => clearTimeout(timer)
    }
    if (!busy && phase === 'loading') {
      const timer = setTimeout(() => setPhase('done'), 0)
      return () => clearTimeout(timer)
    }
    if (!busy && phase === 'done') {
      const timer = setTimeout(() => setPhase('idle'), 500)
      return () => clearTimeout(timer)
    }
  }, [busy, phase])

  if (phase === 'idle') return null
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className={
          phase === 'loading'
            ? 'h-full origin-left rtl:origin-right animate-loading-bar bg-brand-500 dark:bg-brand-400'
            : 'h-full origin-left rtl:origin-right scale-x-100 bg-brand-500 opacity-0 transition-[transform,opacity] duration-300 [transition-delay:0ms,150ms] dark:bg-brand-400'
        }
      />
    </div>
  )
}
