import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIdbStore, createMemoryStore, openStore, type MockStore } from './index'

afterEach(() => vi.restoreAllMocks())

type Counter = { n: number[] }

// The same behaviour is required of both stores, so the contract runs against each.
const makers: [string, () => Promise<MockStore>][] = [
  ['indexeddb', () => createIdbStore(new IDBFactory())],
  ['memory', async () => createMemoryStore()],
]

describe.each(makers)('%s store', (_name, make) => {
  it('readDoc is null on a new database, then returns what transact wrote', async () => {
    const store = await make()
    expect(await store.readDoc()).toBeNull()
    await store.transact(() => ({ doc: { hello: 'world' }, result: null }))
    expect(await store.readDoc()).toEqual({ hello: 'world' })
  })

  it('transact passes the current doc, stores the returned one and hands back the result', async () => {
    const store = await make()
    await store.transact(() => ({ doc: { n: [1] }, result: null }))
    const result = await store.transact((doc) => ({ doc: { n: [...(doc as Counter).n, 2] }, result: 'ok' }))
    expect(result).toBe('ok')
    expect(await store.readDoc()).toEqual({ n: [1, 2] })
  })

  it('a throwing fn stores nothing and rejects with its error', async () => {
    const store = await make()
    await store.transact(() => ({ doc: { n: [1] }, result: null }))
    await expect(
      store.transact(() => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(await store.readDoc()).toEqual({ n: [1] })
  })

  it('readDoc returns a copy', async () => {
    const store = await make()
    await store.transact(() => ({ doc: { n: [1] }, result: null }))
    const copy = (await store.readDoc()) as Counter
    copy.n.push(99)
    expect(await store.readDoc()).toEqual({ n: [1] })
  })

  it('putFile/getFile round-trips a Blob; clearAll empties both stores', async () => {
    const store = await make()
    await store.putFile('a-1', new Blob(['hello'], { type: 'text/plain' }))
    await store.transact(() => ({ doc: { x: 1 }, result: null }))
    const blob = await store.getFile('a-1')
    expect(blob?.type).toBe('text/plain')
    expect(await blob?.text()).toBe('hello')
    expect(await store.getFile('missing')).toBeNull()
    await store.clearAll()
    expect(await store.getFile('a-1')).toBeNull()
    expect(await store.readDoc()).toBeNull()
  })
})

describe('indexeddb store across connections', () => {
  it('two connections writing concurrently keep both writes', async () => {
    const factory = new IDBFactory()
    const a = await createIdbStore(factory)
    const b = await createIdbStore(factory)
    await a.transact(() => ({ doc: { n: [] }, result: null }))
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? a : b).transact((doc) => ({ doc: { n: [...(doc as Counter).n, i] }, result: null })),
      ),
    )
    const stored = (await a.readDoc()) as Counter
    expect([...stored.n].sort((x, y) => x - y)).toEqual([...Array(20).keys()])
    expect(await b.readDoc()).toEqual(stored)
  })
})

describe('openStore', () => {
  it('uses indexeddb when it opens', async () => {
    expect((await openStore(new IDBFactory())).kind).toBe('indexeddb')
  })

  it('falls back to memory when indexedDB.open throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = {
      open: () => {
        throw new Error('SecurityError')
      },
    } as unknown as IDBFactory
    expect((await openStore(broken)).kind).toBe('memory')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('falls back to memory when there is no indexedDB at all', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await openStore(undefined)).kind).toBe('memory')
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('indexeddb resilience', () => {
  it('falls back to memory when indexedDB.open never answers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const silent = { open: () => ({}) } as unknown as IDBFactory // a request that never fires (known WebKit bugs)
    expect((await openStore(silent, 50)).kind).toBe('memory')
    expect(warn).toHaveBeenCalledOnce()
  })

  it('reconnects after the browser closes the connection (Clear site data / versionchange)', async () => {
    const factory = new IDBFactory()
    const store = await createIdbStore(factory)
    await store.transact(() => ({ doc: { n: 1 }, result: null }))
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase('spark-flow.mock')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('blocked: the open connection did not close on versionchange'))
    })
    await store.transact((doc) => ({ doc: { n: doc === null ? 'fresh' : 'stale' }, result: null }))
    expect(await store.readDoc()).toEqual({ n: 'fresh' })
    await store.putFile('a-1', new Blob(['x']))
    expect(await store.getFile('a-1')).not.toBeNull()
  })
})
