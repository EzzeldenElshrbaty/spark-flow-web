import { useEffect, useId, useRef } from 'react'
import { create } from 'zustand'

/**
 * Unsaved changes (UX Phase 1, audit 1.2): a form with changes joins this list while it has them, and the shell's one
 * router blocker (`layout/UnsavedChangesBlocker.tsx`) asks before the change is lost. Back and Forward ask the newest
 * sheet (it sits on top); a move to another page asks the newest page with changes, whatever sheet is open, so a sheet
 * that saves and moves on can't take a changed page with it. A sheet's own Save closes it with a push, which goes
 * through.
 */
export type GuardScope = 'sheet' | 'page'
export type UnsavedGuard = { id: string; scope: GuardScope; ask: (leave: () => void, stay: () => void) => void }

export const useUnsavedGuards = create<{ guards: UnsavedGuard[]; add: (guard: UnsavedGuard) => void; remove: (id: string) => void }>()((set) => ({
  guards: [],
  add: (guard) => set((s) => ({ guards: [...s.guards.filter((g) => g.id !== guard.id), guard] })),
  remove: (id) => set((s) => ({ guards: s.guards.filter((g) => g.id !== id) })),
}))

type Nav = { historyAction: 'POP' | 'PUSH' | 'REPLACE'; from: string; to: string }

/** The guard that answers for this navigation, or none: it goes through. */
export function pickGuard(guards: readonly UnsavedGuard[], nav: Nav): UnsavedGuard | null {
  const newest = guards.at(-1)
  if (!newest) return null
  if (nav.historyAction === 'POP' && newest.scope === 'sheet') return newest
  if (nav.from === nav.to) return null
  return [...guards].reverse().find((g) => g.scope === 'page') ?? null
}

/** Whether this navigation waits for a guard's answer. */
export function shouldBlock(guards: readonly UnsavedGuard[], nav: Nav): boolean {
  return pickGuard(guards, nav) !== null
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
