import { createIdbStore } from './idbStore'
import { createMemoryStore } from './memoryStore'
import type { MockStore } from './types'

export { createIdbStore, createMemoryStore }
export type { MockStore }

/**
 * IndexedDB when it opens, else memory with one warning (old Safari private mode, a locked profile). The factory is
 * passed in, not defaulted, so tests can hand over a fake or none at all.
 */
export async function openStore(factory: IDBFactory | undefined): Promise<MockStore> {
  if (factory) {
    try {
      return await createIdbStore(factory)
    } catch (error) {
      console.warn('IndexedDB is not available; the mock database will only last for this session.', error)
      return createMemoryStore()
    }
  }
  console.warn('IndexedDB is not available; the mock database will only last for this session.')
  return createMemoryStore()
}
