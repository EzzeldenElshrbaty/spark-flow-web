import { create } from 'zustand'

/** The one message or reply being edited in place (spec 6.3), by id; editing another closes it. */
export const useEditing = create<{ id: string | null; start: (id: string) => void; stop: () => void }>((set) => ({
  id: null,
  start: (id) => set({ id }),
  stop: () => set({ id: null }),
}))
