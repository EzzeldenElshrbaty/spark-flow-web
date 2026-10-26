import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './chartUtils'

/** A number that counts up to its value (and on to the next one when it changes). Instant with reduced motion. */
export function CountUp({ value, format = (amount) => Math.round(amount).toLocaleString('en-US') }: { value: number; format?: (amount: number) => string }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    if (reduced) return
    const start = from.current
    const started = performance.now()
    // A timer rather than animation frames, so it still finishes in a background tab.
    const timer = setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / 700)
      const next = start + (value - start) * (1 - (1 - progress) ** 3)
      from.current = next
      setShown(next)
      if (progress === 1) clearInterval(timer)
    }, 16)
    return () => clearInterval(timer)
  }, [value, reduced])

  return <>{format(reduced ? value : shown)}</>
}
