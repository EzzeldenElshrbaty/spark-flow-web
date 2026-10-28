import { create } from 'zustand'

/** Where a message is edited: the channel's list, or the thread panel (a broadcast reply shows in both, spec 6.7). */
export type EditPlace = 'channel' | 'thread'

/**
 * The one message or reply being edited in place (spec 6.3), by id and place; editing another closes it. `from` is
 * where focus was when the edit started (the composer after Up, or the message's toolbar), so it can go back there.
 */
export const useEditing = create<{ id: string | null; place: EditPlace; from: HTMLElement | null; start: (id: string, place?: EditPlace) => void; stop: () => void }>(
  (set) => ({
    id: null,
    place: 'channel',
    from: null,
    start: (id, place = 'channel') => set({ id, place, from: document.activeElement instanceof HTMLElement ? document.activeElement : null }),
    stop: () => set({ id: null }),
  }),
)
