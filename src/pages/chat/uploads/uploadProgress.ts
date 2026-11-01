import { useSyncExternalStore } from 'react'

// How far each upload has gone (0–1), by its card's key. Kept out of the page's state, so a progress tick redraws its
// card alone, not the whole channel page around the tray.
const values = new Map<string, number>()
const listeners = new Set<() => void>()

export const uploadProgress = {
  get: (key: string) => values.get(key),
  set(key: string, value: number) {
    values.set(key, value)
    for (const listener of listeners) listener()
  },
  delete: (key: string) => void values.delete(key),
}

/** A card's live progress, or undefined before the first tick. */
export function useUploadProgress(key: string): number | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => values.get(key),
  )
}
