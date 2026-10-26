import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDb, DB_KEY, DB_VERSION, type DbData } from './db'
import { memoryStorage } from './testing'

const fakeSeed = (_now: Date): DbData => ({
  version: DB_VERSION,
  currentUserId: 'u1',
  users: [{ id: 'u1', name: 'Ada', email: 'ada@example.com', title: 'Engineer', role: 'Management', presence: 'active' }],
  workspaces: [],
  projects: [],
  sprints: [],
  tickets: [],
  channels: [{ id: 'c1', workspaceId: 'w1', kind: 'channel', name: 'general' } as never],
  messages: [],
  replies: [],
  reads: { c1: '2026-01-01T00:00:00.000Z' },
  counters: {},
})

afterEach(() => vi.restoreAllMocks())

const MARK = (id: string) => `spark-flow.mockdb.v1.read.${id}`

describe('read markers', () => {
  it('are seeded into per-channel keys, not the main document', () => {
    const storage = memoryStorage()
    const db = createDb(storage, fakeSeed)
    db.read()
    expect(storage.getItem(MARK('c1'))).toBe('2026-01-01T00:00:00.000Z')
    expect(JSON.parse(storage.getItem(DB_KEY)!)).not.toHaveProperty('reads')
    expect(db.read().reads).toEqual({ c1: '2026-01-01T00:00:00.000Z' })
  })

  it('markRead writes only its own key and never rewrites the main document', () => {
    const storage = memoryStorage()
    const db = createDb(storage, fakeSeed)
    db.read()
    const before = storage.getItem(DB_KEY)
    db.markRead('c1', '2026-02-02T00:00:00.000Z')
    expect(storage.getItem(DB_KEY)).toBe(before)
    expect(storage.getItem(MARK('c1'))).toBe('2026-02-02T00:00:00.000Z')
    expect(db.read().reads.c1).toBe('2026-02-02T00:00:00.000Z')
  })

  it('a stale instance cannot erase another instance\'s message by marking read', () => {
    const storage = memoryStorage()
    const stale = createDb(storage, fakeSeed)
    const other = createDb(storage, fakeSeed)
    stale.read()
    other.update((d) => { d.users[0].name = 'Fresh' })
    stale.markRead('c1', '2026-03-03T00:00:00.000Z')
    expect(other.read().users[0].name).toBe('Fresh')
  })

  it('reset clears every marker and reseeds them', () => {
    const storage = memoryStorage({ [MARK('gone')]: 'x' })
    const db = createDb(storage, fakeSeed)
    db.markRead('c1', '2026-02-02T00:00:00.000Z')
    storage.setItem(MARK('other'), 'y')
    db.reset()
    expect(storage.getItem(MARK('c1'))).toBe('2026-01-01T00:00:00.000Z')
    expect(storage.getItem(MARK('other'))).toBeNull()
    expect(storage.getItem(MARK('gone'))).toBeNull()
  })

  it('fall back to memory when storage cannot be written', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError') } }
    const db = createDb(storage, fakeSeed)
    db.markRead('c1', '2026-02-02T00:00:00.000Z')
    expect(db.read().reads.c1).toBe('2026-02-02T00:00:00.000Z')
  })
})

describe('createDb', () => {
  it('seeds on empty storage and saves under DB_KEY', () => {
    const storage = memoryStorage()
    const db = createDb(storage, fakeSeed)
    expect(db.read().users).toHaveLength(1)
    expect(JSON.parse(storage.getItem(DB_KEY)!).version).toBe(DB_VERSION)
  })

  it('reseeds when the saved version is older', () => {
    const storage = memoryStorage({ [DB_KEY]: JSON.stringify({ ...fakeSeed(new Date()), version: DB_VERSION - 1, users: [] }) })
    expect(createDb(storage, fakeSeed).read().users).toHaveLength(1)
    expect(JSON.parse(storage.getItem(DB_KEY)!).version).toBe(DB_VERSION)
  })

  it('keeps a newer saved version untouched, works from memory, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const newer = JSON.stringify({ ...fakeSeed(new Date()), version: DB_VERSION + 1, users: [] })
    const storage = memoryStorage({ [DB_KEY]: newer })
    const db = createDb(storage, fakeSeed)
    expect(db.read().users).toHaveLength(0)
    db.update((d) => { d.workspaces.push({ id: 'w', name: 'W', slug: 'w' } as never) })
    db.markRead('c1', '2026-01-01T00:00:00.000Z')
    expect(db.read().workspaces).toHaveLength(1)
    expect(db.read().reads).toEqual({ c1: '2026-01-01T00:00:00.000Z' })
    expect(storage.getItem(DB_KEY)).toBe(newer)
    expect(storage.getItem(MARK('c1'))).toBeNull() // nothing written
    expect(warn).toHaveBeenCalledOnce()
  })

  it.each([
    ['a missing collection', { users: undefined }],
    ['a collection of the wrong type', { messages: {} }],
    ['counters of the wrong type', { counters: [] }],
  ])('reseeds when the saved document has %s', (_name, broken) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = memoryStorage({ [DB_KEY]: JSON.stringify({ ...fakeSeed(new Date()), ...broken }) })
    expect(createDb(storage, fakeSeed).read().users).toHaveLength(1)
  })

  it('reseeds and warns on corrupt JSON', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = createDb(memoryStorage({ [DB_KEY]: '{not json' }), fakeSeed)
    expect(db.read().users).toHaveLength(1)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('update writes through and returns the callback result', () => {
    const storage = memoryStorage()
    const db = createDb(storage, fakeSeed)
    expect(db.update((d) => { d.users[0].name = 'Changed'; return 7 })).toBe(7)
    expect(JSON.parse(storage.getItem(DB_KEY)!).users[0].name).toBe('Changed')
  })

  it("update keeps another instance's write", () => {
    const storage = memoryStorage()
    const a = createDb(storage, fakeSeed)
    const b = createDb(storage, fakeSeed)
    a.update((d) => { d.users[0].name = 'A' })
    b.update((d) => { d.users[0].title = 'B' })
    expect(a.read().users[0]).toMatchObject({ name: 'A', title: 'B' })
  })

  it('keeps working when setItem throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError') } }
    const db = createDb(storage, fakeSeed)
    db.update((d) => { d.users[0].name = 'Kept' })
    expect(db.read().users[0].name).toBe('Kept')
    db.update((d) => { d.users[0].name = 'Again' })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('reset reseeds', () => {
    const db = createDb(memoryStorage(), fakeSeed)
    db.update((d) => { d.users = [] })
    db.reset()
    expect(db.read().users).toHaveLength(1)
  })

  it('read hands back a copy, so callers cannot change stored state', () => {
    const db = createDb(memoryStorage(), fakeSeed)
    db.read().users[0].name = 'Mutated'
    expect(db.read().users[0].name).toBe('Ada')
  })

  it('warns once per db instance, not globally', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = () => ({ ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError') } })
    createDb(broken(), fakeSeed).read()
    createDb(broken(), fakeSeed).read()
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('does not save when the update callback throws', () => {
    const storage = memoryStorage()
    const db = createDb(storage, fakeSeed)
    expect(() => db.update((d) => { d.users[0].name = 'Half'; throw new Error('boom') })).toThrow('boom')
    expect(db.read().users[0].name).toBe('Ada')
  })

  it('keeps working in memory when getItem throws, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = { ...memoryStorage(), getItem: () => { throw new Error('SecurityError') } }
    const db = createDb(storage, fakeSeed)
    expect(db.read().users).toHaveLength(1)
    db.update((d) => { d.users[0].name = 'Kept' })
    db.markRead('c1', 'T')
    expect(db.read().users[0].name).toBe('Kept')
    expect(db.read().reads).toEqual({ c1: 'T' })
    expect(warn).toHaveBeenCalledOnce()
  })

  it('does not lose writes when getItem throws but setItem works', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = { ...memoryStorage(), getItem: () => { throw new Error('SecurityError') } }
    const db = createDb(storage, fakeSeed)
    db.update((d) => { d.users[0].name = 'First' })
    expect(db.read().users[0].name).toBe('First')
    db.update((d) => { d.users[0].title = 'Second' })
    expect(db.read().users[0]).toMatchObject({ name: 'First', title: 'Second' })
  })

  it('in-memory fallback: a value returned from update does not alias stored state', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const storage = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceededError') } }
    const db = createDb(storage, fakeSeed)
    const user = db.update((d) => { d.users[0].name = 'Kept'; return d.users[0] })
    user.name = 'Tampered'
    expect(db.read().users[0].name).toBe('Kept')
  })
})
