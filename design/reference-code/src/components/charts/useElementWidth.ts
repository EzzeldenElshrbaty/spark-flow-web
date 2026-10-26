import { useCallback, useState } from 'react'

/** Width of an element, kept up to date as it resizes. Pass `ref` to the element. */
export function useElementWidth() {
  const [width, setWidth] = useState(0)
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}
