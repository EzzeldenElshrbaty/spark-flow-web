import { useState } from 'react'
import { allowedFilesHint, allowedFilesShort } from '@/lib/fileTypes'

/** Under a file box (UX Phase 4, 4.9): the kinds in one line, and the full list behind "Which files?". */
export function FileTypesHint() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1 text-xs text-fg-muted">
      <span>{allowedFilesShort}</span>{' '}
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="font-medium text-accent hover:underline">
        Which files?
      </button>
      {open && <span className="mt-1 block">{allowedFilesHint}.</span>}
    </div>
  )
}
