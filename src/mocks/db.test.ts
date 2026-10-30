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
  channelState: {},
  mentionReads: {},
  activity: [],
  drafts: [],
  trash: [],
  threadFollows: [],
  notifications: [],
  invitations: [],
  saved: [],
  scheduled: [],
  pins: [],
  folders: [],
  bookmarks: [],
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
    for (const bad of [{ ...emptyData(), version: DB_VERSION - 1, users: [] }, { ...emptyData(), users: 'nope' }, { ...emptyData(), channelState: [] }]) {
      const store = createMemoryStore()
      await store.transact(() => ({ doc: bad, result: null }))
      expect((await createDb(store, fakeSeed).read()).users).toHaveLength(1)
    }
  })

  it('a stored v3 document with broken users reseeds on start', async () => {
    const store = createMemoryStore()
    await store.transact(() => ({ doc: { ...emptyData(), version: 3, users: {} }, result: null }))
    const data = await createDb(store, fakeSeed).read()
    expect(data.version).toBe(DB_VERSION)
    expect(data.users).toHaveLength(1)
  })

  it('a stored v4 document a migration step chokes on reseeds on start, and is refused on import', async () => {
    for (const projects of [{}, [null]]) {
      const broken = { ...emptyData(), version: 4, projects }
      const store = createMemoryStore()
      await store.transact(() => ({ doc: broken, result: null }))
      expect((await createDb(store, fakeSeed).read()).users).toHaveLength(1)
      const db = createDb(createMemoryStore(), fakeSeed)
      await expect(db.importAll({ app: 'spark-flow', version: 4, exportedAt: 'T', data: broken })).rejects.toMatchObject({
        name: 'ApiError',
        status: 400,
        detail: "That file isn't a Spark Flow export.",
      })
    }
  })

  it('a v3 document is migrated, not reseeded: its records stay and reads move to the default person', async () => {
    const store = createMemoryStore()
    const { channelState: _, ...v3Base } = emptyData()
    const v3 = { ...v3Base, version: 3, reads: { c1: '2026-02-02T00:00:00.000Z' }, counters: { p1: 7 } }
    await store.transact(() => ({ doc: v3, result: null }))
    const data = await createDb(store, fakeSeed).read()
    expect(data.version).toBe(DB_VERSION)
    expect(data.counters).toEqual({ p1: 7 })
    // No messages yet, so the read time becomes a marker before the first one; a channel's level is Mentions (v12).
    const migrated = { ...state, notifyLevel: 'mentions' }
    expect(data.channelState).toEqual({ u1: { c1: migrated } })
    expect(await store.readDoc()).toMatchObject({ version: DB_VERSION, channelState: { u1: { c1: migrated } } })
  })

  it('a v4 document migrates: custom names and order are kept, types come from the old ids, activity starts empty', async () => {
    const store = createMemoryStore()
    const v4 = {
      ...emptyData(),
      version: 4,
      projects: [
        { id: 'p1', board: [{ status: 'done', label: 'Shipped' }, { status: 'inReview', label: 'Testing' }] },
        { id: 'p2' },
      ],
    } as unknown as DbData
    delete (v4 as Partial<DbData>).activity
    await store.transact(() => ({ doc: v4, result: null }))
    const data = await createDb(store, fakeSeed).read()
    expect(data.version).toBe(DB_VERSION)
    expect(data.activity).toEqual([])
    expect(data.projects[0]!.board).toEqual([
      { id: 'done', label: 'Shipped', category: 'done' },
      { id: 'inReview', label: 'Testing', category: 'inProgress' },
      { id: 'backlog', label: 'Backlog', category: 'todo' },
      { id: 'todo', label: 'To do', category: 'todo' },
      { id: 'inProgress', label: 'In progress', category: 'inProgress' },
    ])
    expect(data.projects[1]!.board).toHaveLength(5)
  })

  it('a document older than any migration is still reseeded', async () => {
    const store = createMemoryStore()
    await store.transact(() => ({ doc: { ...emptyData(), version: 1, counters: { p1: 7 } }, result: null }))
    expect((await createDb(store, fakeSeed).read()).counters).toEqual({})
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
      d.channelState.u1 = { c1: state }
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
      d.channelState.u1 = { c1: { ...state, lastReadSeq: 4 } }
    })
    expect(await store.readDoc()).toMatchObject({ channelState: { u1: { c1: { lastReadSeq: 4 } } } })
  })

  it('concurrent updates from two dbs on one IndexedDB keep both changes', async () => {
    const factory = new IDBFactory()
    const a = createDb(await createIdbStore(factory), fakeSeed)
    const b = createDb(await createIdbStore(factory), fakeSeed)
    await a.read() // seed once
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 ? a : b).update((d) => {
          d.channelState[`u${i}`] = { c: state }
        }),
      ),
    )
    expect(Object.keys((await b.read()).channelState).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `u${i}`).sort())
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
      d.channelState.u1 = { c1: state }
    })
    const bundle = await db.exportAll()
    expect(bundle).toMatchObject({ app: 'spark-flow', version: DB_VERSION })
    expect(typeof bundle.exportedAt).toBe('string')
    await db.reset()
    await db.importAll(JSON.parse(JSON.stringify(bundle)))
    expect(await db.read()).toEqual(bundle.data)
  })

  it('thread follows survive an export and an import (they have no id of their own: a person and a thread)', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    await db.update((d) => {
      d.threadFollows = [{ userId: 'u1', rootId: 'm1', following: false }]
    })
    const bundle = await db.exportAll()
    await db.reset()
    await db.importAll(JSON.parse(JSON.stringify(bundle)))
    expect((await db.read()).threadFollows).toEqual([{ userId: 'u1', rootId: 'm1', following: false }])
  })

  it('a follow without its person or thread is refused on import', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    const data = { ...(await db.exportAll()).data, threadFollows: [{ userId: 'u1', following: true }] }
    await expect(db.importAll({ app: 'spark-flow', version: DB_VERSION, exportedAt: 'T', data })).rejects.toMatchObject({ status: 400 })
  })

  it('export while viewing as someone keeps the default person', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    await db.update((d) => {
      d.users.push({ ...d.users[0]!, id: 'u2', name: 'Bea' })
    })
    db.actAs('u2')
    expect((await db.read()).currentUserId).toBe('u2')
    expect((await db.exportAll()).data.currentUserId).toBe('u1')
  })

  it('a v5 export imports and is upgraded', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    const v5 = { ...emptyData(), version: 5, rates: [{ userId: 'u1', hourlyCost: 300, currency: 'EGP' }] } as unknown as DbData
    await db.importAll({ app: 'spark-flow', version: 5, exportedAt: 'T', data: v5 })
    const data = await db.read()
    expect(data.version).toBe(DB_VERSION)
    expect(data.rates).toEqual([{ id: 'r-u1', userId: 'u1', hourlyCost: 300, currency: 'EGP', effectiveFrom: '1970-01-01T00:00:00.000Z' }])
  })

  it('a v4 export imports and is upgraded', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    const v4 = { ...emptyData(), version: 4, counters: { p1: 3 }, projects: [{ id: 'p1', board: [{ status: 'done', label: 'Shipped' }] }] } as unknown as DbData
    delete (v4 as Partial<DbData>).activity
    await db.importAll({ app: 'spark-flow', version: 4, exportedAt: 'T', data: v4 })
    const data = await db.read()
    expect(data.version).toBe(DB_VERSION)
    expect(data.counters).toEqual({ p1: 3 })
    expect(data.activity).toEqual([])
    expect(data.projects[0]!.board![0]).toEqual({ id: 'done', label: 'Shipped', category: 'done' })
  })

  it("a newer export says so; a broken one says it isn't an export", async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    const before = await db.read()
    await expect(db.importAll({ app: 'spark-flow', version: DB_VERSION + 1, exportedAt: 'T', data: {} })).rejects.toMatchObject({
      status: 400,
      detail: 'That export is from a newer version of Spark Flow. Update the app, then import it again.',
    })
    await expect(db.importAll({ app: 'spark-flow', version: 3, exportedAt: 'T', data: { ...emptyData(), version: 3, users: {} } })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      detail: "That file isn't a Spark Flow export.",
    })
    expect(await db.read()).toEqual(before)
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
      // Every collection there, but no mention read state: an export from before mentions existed.
      { app: 'spark-flow', version: DB_VERSION, data: (({ mentionReads: _m, ...rest }) => rest)(emptyData()) },
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

describe('importAll contents', () => {
  it('rejects a well-shaped bundle whose records are broken, and writes nothing', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    const before = await db.read()
    const good = (await db.exportAll()).data
    const broken = [
      { ...good, currentUserId: 'u-missing' }, // nobody to be: me() would 404 and lock the admin out
      { ...good, users: [{ name: 'No id' }] },
      { ...good, workspaces: [42] },
      { ...good, rates: [{ hourlyCost: 1 }] }, // rates are keyed by userId, not id
    ]
    for (const data of broken)
      await expect(db.importAll({ app: 'spark-flow', version: DB_VERSION, data })).rejects.toMatchObject({ name: 'ApiError', status: 400 })
    expect(await db.read()).toEqual(before)
  })
})

describe('import clears old files', () => {
  it('import clears old file bytes', async () => {
    const db = createDb(createMemoryStore(), fakeSeed)
    const bundle = await db.exportAll()
    await db.putFile('old-file', new Blob(['x']))
    await db.importAll(JSON.parse(JSON.stringify(bundle)))
    expect(await db.getFile('old-file')).toBeNull()
  })
})

describe("import over a newer build's data", () => {
  it("importing while the saved data is from a newer build writes the import (it isn't lost on reload)", async () => {
    const store = createMemoryStore()
    await store.transact(() => ({ doc: { ...emptyData(), version: DB_VERSION + 1 }, result: null }))
    const db = createDb(store, fakeSeed)
    await db.read() // the newer document: this tab works in memory and leaves it alone
    const bundle = { app: 'spark-flow', version: DB_VERSION, exportedAt: 'T', data: { ...emptyData(), counters: { p1: 42 } } }
    await db.importAll(bundle)
    expect((await createDb(store, fakeSeed).read()).counters).toEqual({ p1: 42 })
  })
})

const state = { lastReadSeq: 0, starred: false, muted: false, notifyLevel: 'all' as const }

