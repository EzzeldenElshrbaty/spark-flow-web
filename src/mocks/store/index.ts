import { createIdbStore } from './idbStore'
import { createMemoryStore } from './memoryStore'
import type { MockStore } from './types'

export { createIdbStore, createMemoryStore }
export type { MockStore }

/**
 * IndexedDB when it opens (within `timeoutMs`), else memory with one warning (old Safari private mode, a locked profile). The factory is
 * passed in, not defaulted, so tests can hand over a fake or none at all.
 */
export async function openStore(factory: IDBFactory | undefined, timeoutMs = 3000): Promise<MockStore> {
  if (factory) {
    try {
      // Some browsers never answer an open request; after a few seconds, carry on from memory instead of hanging.
      const timedOut = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('IndexedDB did not open in time')), timeoutMs))
      return await Promise.race([createIdbStore(factory), timedOut])
    } catch (error) {
      console.warn('IndexedDB is not available; the mock database will only last for this session.', error)
      return createMemoryStore()
    }
  }
  console.warn('IndexedDB is not available; the mock database will only last for this session.')
  return createMemoryStore()
}
