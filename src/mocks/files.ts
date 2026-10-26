import type { Api } from '@/api/types'
import type { MockDb } from './db'
import { delay } from './latency'
import { notFound } from './shared'

export function filesApi(db: MockDb): Api['files'] {
  return {
    /** A blob: address for a stored file. The page that shows it frees it with URL.revokeObjectURL when done. */
    async url(id) {
      await delay()
      const [blob, data] = await Promise.all([db.getFile(id), db.read()])
      if (!blob || !data.attachments.some((a) => a.id === id)) throw notFound('File', id)
      return URL.createObjectURL(blob)
    },
  }
}
