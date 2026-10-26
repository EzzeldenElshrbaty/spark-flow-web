import type { KeyValueStorage } from './db'

/** A Map-backed KeyValueStorage. The mock backend falls back to it when the browser blocks localStorage. */
export function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}
