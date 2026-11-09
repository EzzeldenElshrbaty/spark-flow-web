import clsx from 'clsx'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { inputClass } from './Field'

/** How long the box waits after the last key before it sends the words (kit: debounced 300 ms). */
export const SEARCH_WAIT_MS = 300

/**
 * A list's search box (kit pattern A, UX Phase 4): what's typed shows at once and goes to `onChange` after a pause;
 * when `value` changes from outside (Back, Clear) the box takes it, but the words it just sent never overwrite what
 * was typed since.
 */
export function SearchBox({ label, placeholder, value, onChange, className }: { label: string; placeholder?: string; value: string; onChange: (words: string) => void; className?: string }) {
  const [words, setWords] = useState(value)
  const sent = useRef(value)
  useEffect(() => {
    if (value !== sent.current) setWords(value)
    sent.current = value
  }, [value])
  useEffect(() => {
    if (words === value) return
    const timer = setTimeout(() => {
      sent.current = words
      onChange(words)
    }, SEARCH_WAIT_MS)
    return () => clearTimeout(timer)
  })
  return (
    <label className={clsx('relative block', className)}>
      <span className="sr-only">{label}</span>
      <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
      <input type="search" className={clsx(inputClass, 'ps-9')} placeholder={placeholder} value={words} onChange={(e) => setWords(e.target.value)} />
    </label>
  )
}
