import type { Api } from '@/api/types'
import type { MockDb } from './db'
import { delay } from './latency'
import { notFound } from './shared'

export function filesApi(db: MockDb): Api['files'] {
  return {
    async url(id) {
      await delay()
      // File bytes arrive with the IndexedDB store (M0 Task 3); until then no file can be opened.
      void db
      throw notFound('File', id)
    },
  }
}
