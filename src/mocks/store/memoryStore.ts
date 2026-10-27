import type { MockStore } from './types'

/** The store in memory: for tests, and for browsers that block IndexedDB. Lasts as long as the page. */
export function createMemoryStore(): MockStore {
  let doc: unknown | null = null
  const files = new Map<string, Blob>()
  // Writes queue one after another, like IndexedDB transactions do.
  let queue: Promise<unknown> = Promise.resolve()

  return {
    kind: 'memory',
    async readDoc() {
      return doc === null ? null : structuredClone(doc)
    },
    transact(fn) {
      const run = queue.then(() => {
        const next = fn(doc === null ? null : structuredClone(doc))
        doc = structuredClone(next.doc)
        return next.result
      })
      queue = run.catch(() => undefined)
      return run
    },
    async getFile(id) {
      return files.get(id) ?? null
    },
    async putFile(id, blob) {
      files.set(id, blob)
    },
    async deleteFile(id) {
      files.delete(id)
    },
    async clearAll() {
      doc = null
      files.clear()
    },
  }
}
