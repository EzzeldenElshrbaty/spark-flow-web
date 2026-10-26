import { useSyncExternalStore } from 'react'

// Loading that happens outside React Query (signing in, the lists loaded before the app shows),
// counted so the top loading bar can show for it too.
let pending = 0
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** Shows the top loading bar until the promise settles, and hands the promise back. */
export function trackLoading<T>(promise: Promise<T>): Promise<T> {
  pending++
  notify()
  const done = () => {
    pending--
    notify()
  }
  promise.then(done, done)
  return promise
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** True while anything passed to trackLoading is still running. */
export const useTrackedLoading = () => useSyncExternalStore(subscribe, () => pending > 0)
