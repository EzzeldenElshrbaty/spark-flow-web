import { useEffect, useId, useRef } from 'react'
import { create } from 'zustand'

/**
 * Unsaved changes (UX Phase 1, audit 1.2): a form with changes joins this list while it has them, and the shell's one
 * router blocker (`layout/UnsavedChangesBlocker.tsx`) asks the newest one before the page goes away. A sheet asks only
 * on Back and Forward (its own Save closes it with a push, which must go through); a page asks before any move to
 * another page.
 */
export type GuardScope = 'sheet' | 'page'
export type UnsavedGuard = { id: string; scope: GuardScope; ask: (leave: () => void, stay: () => void) => void }

export const useUnsavedGuards = create<{ guards: UnsavedGuard[]; add: (guard: UnsavedGuard) => void; remove: (id: string) => void }>()((set) => ({
  guards: [],
  add: (guard) => set((s) => ({ guards: [...s.guards.filter((g) => g.id !== guard.id), guard] })),
  remove: (id) => set((s) => ({ guards: s.guards.filter((g) => g.id !== id) })),
}))

/** Whether this navigation waits for the newest guard's answer. */
export function shouldBlock(guards: readonly UnsavedGuard[], nav: { historyAction: 'POP' | 'PUSH' | 'REPLACE'; from: string; to: string }): boolean {
  const newest = guards.at(-1)
  if (!newest) return false
  return newest.scope === 'sheet' ? nav.historyAction === 'POP' : nav.from !== nav.to
}

/** Joins the guards while `dirty`; `ask` is read when asked, so it may change on every render. */
export function useUnsavedChanges(dirty: boolean, scope: GuardScope, ask: UnsavedGuard['ask']): void {
  const id = useId()
  const askRef = useRef(ask)
  useEffect(() => {
    askRef.current = ask
  })
  useEffect(() => {
    if (!dirty) return
    const { add, remove } = useUnsavedGuards.getState()
    add({ id, scope, ask: (leave, stay) => askRef.current(leave, stay) })
    return () => remove(id)
  }, [dirty, id, scope])
}
