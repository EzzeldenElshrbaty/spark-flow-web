import { createMemoryStorage } from './memoryStore'

/** A Map-backed stand-in for localStorage. Test-only: app code must not import this file. */
export const memoryStorage = createMemoryStorage
