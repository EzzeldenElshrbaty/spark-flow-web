import { create } from 'zustand'

/**
 * The one message or reply being edited in place (spec 6.3), by id; editing another closes it. `from` is where focus
 * was when the edit started (the composer after Up, or the message's ⋯ button), so it can go back there at the end.
 */
export const useEditing = create<{ id: string | null; from: HTMLElement | null; start: (id: string) => void; stop: () => void }>((set) => ({
  id: null,
  from: null,
  start: (id) => set({ id, from: document.activeElement instanceof HTMLElement ? document.activeElement : null }),
  stop: () => set({ id: null }),
}))
