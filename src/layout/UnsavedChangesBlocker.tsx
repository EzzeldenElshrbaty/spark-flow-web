import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import { shouldBlock, useUnsavedGuards } from '@/lib/unsavedChanges'

/**
 * The shell's one router blocker (a router allows only one): while a form has unsaved changes, a navigation it would
 * lose them to waits for the newest form's answer (`lib/unsavedChanges.ts`), and closing or reloading the tab gets
 * the browser's own question.
 */
export function UnsavedChangesBlocker() {
  const active = useUnsavedGuards((s) => s.guards.length > 0)
  const blocker = useBlocker(({ historyAction, currentLocation, nextLocation }) =>
    shouldBlock(useUnsavedGuards.getState().guards, { historyAction, from: currentLocation.pathname, to: nextLocation.pathname }),
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const newest = useUnsavedGuards.getState().guards.at(-1)
    // The form went away meanwhile: nothing is left to lose.
    if (!newest) blocker.proceed()
    else newest.ask(blocker.proceed, blocker.reset)
  }, [blocker])

  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])

  return null
}
