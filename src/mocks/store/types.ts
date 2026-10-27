/**
 * Where the mock backend keeps its data: one JSON document plus file bytes. A write is one transaction, so two
 * tabs writing at the same moment never lose each other's change.
 */
export interface MockStore {
  /** The document, a copy; null before anything was written. */
  readDoc(): Promise<unknown | null>
  /** Reads the document, hands it to fn and saves what fn returns, all in one transaction. fn must not await. */
  transact<T>(fn: (doc: unknown | null) => { doc: unknown; result: T }): Promise<T>
  getFile(id: string): Promise<Blob | null>
  putFile(id: string, blob: Blob): Promise<void>
  /** Throws a file's bytes away; nothing happens when there are none. */
  deleteFile(id: string): Promise<void>
  /** Empties the document and every file. */
  clearAll(): Promise<void>
  kind: 'indexeddb' | 'memory'
}
