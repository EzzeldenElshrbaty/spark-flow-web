import type { MockStore } from './types'

export const IDB_NAME = 'spark-flow.mock'
export const IDB_VERSION = 1
const DOC = 'doc'
const FILES = 'files'
const MAIN = 'main'

const done = (request: IDBRequest) =>
  new Promise<unknown>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const finished = (txn: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    txn.oncomplete = () => resolve()
    txn.onabort = () => reject(txn.error ?? new Error('Transaction aborted'))
    txn.onerror = () => reject(txn.error)
  })

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(IDB_NAME, IDB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DOC)) db.createObjectStore(DOC)
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB open was blocked'))
  })
}

/** The store in IndexedDB. Rejects if the database can't be opened. */
export async function createIdbStore(factory: IDBFactory): Promise<MockStore> {
  // The browser can close the connection under us (Clear site data, a newer version opening, iOS backgrounding).
  // Close it when asked, and open it again the next time a transaction is needed.
  let db: IDBDatabase | null = null
  const connect = async () => {
    const opened = await open(factory)
    opened.onversionchange = () => {
      opened.close()
      if (db === opened) db = null
    }
    opened.onclose = () => {
      if (db === opened) db = null
    }
    db = opened
    return opened
  }
  await connect()

  /** A transaction on a live connection: reconnects once if the old one was closed. */
  const transaction = async (names: string | string[], mode: IDBTransactionMode) => {
    const current = db ?? (await connect())
    try {
      return current.transaction(names, mode)
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'InvalidStateError') throw error
      db = null
      return (await connect()).transaction(names, mode)
    }
  }

  return {
    kind: 'indexeddb',
    async readDoc() {
      const txn = await transaction(DOC, 'readonly')
      const value = await done(txn.objectStore(DOC).get(MAIN))
      return value === undefined ? null : value // structured clone: already a copy
    },
    async transact(fn) {
      const txn = await transaction(DOC, 'readwrite')
      return new Promise((resolve, reject) => {
        const store = txn.objectStore(DOC)
        let result: ReturnType<typeof fn>['result']
        let failure: unknown = null
        const get = store.get(MAIN)
        get.onsuccess = () => {
          try {
            const next = fn(get.result === undefined ? null : get.result)
            result = next.result
            store.put(next.doc, MAIN)
          } catch (error) {
            failure = error
            txn.abort()
          }
        }
        finished(txn).then(
          () => resolve(result),
          (error) => reject(failure ?? error),
        )
      })
    },
    async getFile(id) {
      const txn = await transaction(FILES, 'readonly')
      const value = await done(txn.objectStore(FILES).get(id))
      return value instanceof Blob ? value : null
    },
    async deleteFile(id) {
      const txn = await transaction(FILES, 'readwrite')
      txn.objectStore(FILES).delete(id)
      await finished(txn)
    },
    async putFile(id, blob) {
      const txn = await transaction(FILES, 'readwrite')
      txn.objectStore(FILES).put(blob, id)
      await finished(txn)
    },
    async clearAll() {
      const txn = await transaction([DOC, FILES], 'readwrite')
      txn.objectStore(DOC).clear()
      txn.objectStore(FILES).clear()
      await finished(txn)
    },
  }
}
