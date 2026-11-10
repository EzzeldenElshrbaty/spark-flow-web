import { useState } from 'react'
import { useUnsavedChanges } from '@/lib/unsavedChanges'
import { Button } from './Button'
import { Sheet } from './Sheet'

/**
 * A page with unsaved changes (the Roles matrix, Hourly cost rows): moving to another page asks "Leave without
 * saving?" first (UX Phase 1, 1.2). The shell's `UnsavedChangesBlocker` holds the navigation meanwhile.
 */
export function LeaveGuard({ dirty, description }: { dirty: boolean; description: string }) {
  const [asked, setAsked] = useState<{ leave: () => void; stay: () => void } | null>(null)
  useUnsavedChanges(dirty, 'page', (leave, stay) => setAsked({ leave, stay }))
  const answer = (pick: 'leave' | 'stay') => {
    const way = asked?.[pick]
    setAsked(null)
    way?.()
  }
  return (
    <Sheet
      open={asked !== null}
      onClose={() => answer('stay')}
      title="Leave without saving?"
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={() => answer('stay')}>
            Stay
          </Button>
          <Button variant="danger" onClick={() => answer('leave')}>
            Leave without saving
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-secondary">Your changes are lost if you leave this page now.</p>
    </Sheet>
  )
}
