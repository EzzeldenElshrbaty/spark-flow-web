import type { Api } from '@/api/types'
import type { MockDb } from './db'
import { delay } from './latency'

export function devApi(db: MockDb): Api['dev'] {
  return {
    async resetDemoData() {
      await delay()
      db.reset() // publishes nothing: the UI clears its own cache
    },
  }
}
