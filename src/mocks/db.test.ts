import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDb, DB_VERSION, removeLegacyStorage, type DbData, type SeedResult } from './db'
import { createIdbStore, createMemoryStore } from './store'

afterEach(() => vi.restoreAllMocks())

const emptyData = (): DbData => ({
  version: DB_VERSION,
  currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Ada', email: 'ada@example.com', title: 'Engineer', role: 'admin', presence: 'active', teamIds: [] }],
  workspaces: [],
  projects: [],
  sprints: [],
  tickets: [],
  channels: [],
  messages: [],
  replies: [],
  teams: [],
  phases: [],
  deliverables: [],
  comments: [],
  attachments: [],
  projectFiles: [],
  timeEntries: [],
  checkIns: [],
  rates: [],
  reads: {},
  counters: {},
})

// One small file, so seeding is seen to write file bytes too.
const fakeSeed = (_now: Date): SeedResult => ({
  data: emptyData(),
  files: { 'a-hello': { mimeType: 'text/plain', base64: btoa('hello') } },
})

describe('createDb', () => {
  it('seeds on an empty store and writes seed files', async () => {
    const store = createMemoryStore()
    const db = createDb(store, fakeSeed)
    expect((await db.read()).users).toHaveLength(1)
    expect(await store.readDoc()).toMatchObject({ version: DB_VERSION })
    expect(await (await db.getFile('a-hello'))?.text()).toBe('hello')
  })

  it('reseeds an older or wrong-shape doc', async () => {
    for (const bad of [{ ...emptyData(), version: DB_VERSION - 1, users: [] }, { ...emptyData(), users: 'nope' }, { ...emptyData(), reads: [] }]) {
      const store = createMemoryStore()
      await store.transact(() => ({ doc: bad, result: null }))
      expect((await createDb(store, fakeSeed).read()).users).toHaveLength(1)
    }
  })

  it('keeps a newer doc untouched, works from memory and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = createMemoryStore()
    const newer = { ...emptyData(), version: DB_VERSION + 1 }
    await store.transact(() => ({ doc: newer, result: null }))
    const db = createDb(store, fakeSeed)
    await db.update((d) => {
      d.users[0].name = 'Changed'
    })
    expect((await db.read()).users[0].name).toBe('Changed')
    await db.update((d) => {
      d.reads.c1 = 'T'
    })
    expect(await store.readDoc()).toEqual(newer)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('update returns the callback result and persists; a throwing callback stores nothing', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    expect(
      await db.update((d) => {
        d.users[0].name = 'Grace'
        return 7
      }),
    ).toBe(7)
    expect((await db.read()).users[0].name).toBe('Grace')
    await expect(
      db.update((d) => {
        d.users[0].name = 'Lost'
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect((await db.read()).users[0].name).toBe('Grace')
  })

  it('read returns a copy', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    ;(await db.read()).users.push({ ...emptyData().users[0], id: 'u9' })
    expect((await db.read()).users).toHaveLength(1)
  })

  it('keeps read markers in the document', async () => {
    const store = createMemoryStore()
    const db = createDb(store, fakeSeed)
    await db.update((d) => {
      d.reads.c1 = '2026-02-02T00:00:00.000Z'
    })
    expect(await store.readDoc()).toMatchObject({ reads: { c1: '2026-02-02T00:00:00.000Z' } })
  })

  it('concurrent updates from two dbs on one IndexedDB keep both changes', async () => {
    const factory = new IDBFactory()
    const a = createDb(await createIdbStore(factory), fakeSeed)
    const b = createDb(await createIdbStore(factory), fakeSeed)
    await a.read() // seed once
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 ? a : b).update((d) => {
          d.reads[`c${i}`] = 'T'
        }),
      ),
    )
    expect(Object.keys((await b.read()).reads).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `c${i}`).sort())
  })

  it('reset clears everything and seeds again', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    await db.update((d) => {
      d.users = []
    })
    await db.putFile('a-extra', new Blob(['x']))
    await db.reset()
    expect((await db.read()).users).toHaveLength(1)
    expect(await db.getFile('a-extra')).toBeNull()
    expect(await db.getFile('a-hello')).not.toBeNull()
  })

  it('exportAll → reset → importAll restores the same data', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    await db.update((d) => {
      d.users[0].name = 'Exported'
      d.reads.c1 = 'T'
    })
    const bundle = await db.exportAll()
    expect(bundle).toMatchObject({ app: 'spark-flow', version: DB_VERSION })
    expect(typeof bundle.exportedAt).toBe('string')
    await db.reset()
    await db.importAll(JSON.parse(JSON.stringify(bundle)))
    expect(await db.read()).toEqual(bundle.data)
  })

  it('importAll rejects bad bundles without writing', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    const before = await db.read()
    for (const bad of [
      null,
      {},
      { app: 'other', version: DB_VERSION, data: emptyData() },
      { app: 'spark-flow', version: 99, data: emptyData() },
      { app: 'spark-flow', version: DB_VERSION, data: { users: 'x' } },
    ])
      await expect(db.importAll(bad)).rejects.toMatchObject({ name: 'ApiError', status: 400 })
    expect(await db.read()).toEqual(before)
  })
})

describe('removeLegacyStorage', () => {
  it('removes legacy localStorage keys on first start', () => {
    const map = new Map([
      ['spark-flow.mockdb.v1', '{}'],
      ['spark-flow.mockdb.v1.read.c-x', 'T'],
      ['spark-flow.theme', 'dark'],
    ])
    const storage = {
      get length() {
        return map.size
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => void map.delete(k),
    }
    removeLegacyStorage(storage)
    expect([...map.keys()]).toEqual(['spark-flow.theme'])
  })

  it('ignores missing or blocked storage', () => {
    expect(() => removeLegacyStorage(undefined)).not.toThrow()
    const blocked = {
      get length(): number {
        throw new Error('SecurityError')
      },
      key: () => null,
      removeItem: () => {},
    }
    expect(() => removeLegacyStorage(blocked)).not.toThrow()
  })
})
