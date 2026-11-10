import { useEffect, useState } from 'react'

/**
 * Whether an element has scrolled up out of view under a bar `offset` px tall (the top bar): for a sticky row that
 * names what scrolled away (the project page on phones, UX Phase 5B, 5.1). Returns a ref to put on the element (it
 * may mount later, after its data) and the answer.
 */
export function useScrolledPast(offset: number): [(el: Element | null) => void, boolean] {
  const [el, setEl] = useState<Element | null>(null)
  const [past, setPast] = useState(false)
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setPast(!entry!.isIntersecting && entry!.boundingClientRect.bottom <= offset), {
      rootMargin: `-${offset}px 0px 0px 0px`,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, offset])
  return [setEl, past]
}
