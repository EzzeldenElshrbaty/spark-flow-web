import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'
import { pickGuard, useUnsavedGuards, type UnsavedGuard } from '@/lib/unsavedChanges'

/**
 * The shell's one router blocker (a router allows only one): while a form has unsaved changes, a navigation it would
 * lose them to waits for the answer of the form `pickGuard` names (`lib/unsavedChanges.ts`), and closing or reloading the tab gets
 * the browser's own question.
 */
export function UnsavedChangesBlocker() {
  const active = useUnsavedGuards((s) => s.guards.length > 0)
  // Who answers the navigation being held, as decided when it was held.
  const answering = useRef<UnsavedGuard | null>(null)
  const blocker = useBlocker(({ historyAction, currentLocation, nextLocation }) => {
    answering.current = pickGuard(useUnsavedGuards.getState().guards, { historyAction, from: currentLocation.pathname, to: nextLocation.pathname })
    return answering.current !== null
  })

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    const guard = answering.current
    // The form went away meanwhile: nothing is left to lose.
    if (!guard || !useUnsavedGuards.getState().guards.some((g) => g.id === guard.id)) blocker.proceed()
    else guard.ask(blocker.proceed, blocker.reset)
  }, [blocker])

  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [active])

  return null
}
