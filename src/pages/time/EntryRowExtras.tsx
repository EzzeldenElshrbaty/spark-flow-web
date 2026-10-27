import { useState } from 'react'
import type { TimeEntry } from '@/api/types'
import { capped } from '@/lib/hours'
import { useRole } from '@/lib/useRole'
import { canChangeEntry, EntryActions } from '@/pages/time/EntryActions'

/** What a time entry row ends with: the "stopped at 12 h" fix link and the ⋯ menu, for whoever may change it. */
export function EntryRowExtras({ entry, compact = false }: { entry: TimeEntry; compact?: boolean }) {
  const { persona } = useRole()
  const [fixing, setFixing] = useState(false)
  if (!canChangeEntry(entry, persona)) return null
  return (
    <span className="flex shrink-0 items-center gap-1">
      {capped(entry) && (
        <button
          type="button"
          onClick={() => setFixing(true)}
          aria-label="Stopped at the 12 h limit · Fix it"
          title="Stopped at the 12 h limit · Fix it"
          className="whitespace-nowrap rounded-md px-1.5 text-xs font-medium text-amber-700 hover:underline dark:text-amber-300"
        >
          {compact ? '12 h · Fix' : 'Stopped at the 12 h limit · Fix it'}
        </button>
      )}
      <EntryActions entry={entry} editing={fixing} onEditingChange={setFixing} />
    </span>
  )
}
