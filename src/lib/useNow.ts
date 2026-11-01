import { useEffect, useState } from 'react'

/** The current time, refreshed every `intervalMs` (0: never), for clocks that tick. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Fresh at once when a clock starts ticking, not only after its first interval.
    setNow(new Date())
    if (!intervalMs) return
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
