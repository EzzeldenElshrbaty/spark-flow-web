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
  channels: [],
  messages: [],
  replies: [],
  reads: {},
  counters: {},
})

afterEach(() => vi.restoreAllMocks())

describe('createDb', () => {
  it('seeds on empty storage and saves under DB_KEY', () => {
    const storage = memoryStorage()
    const db = createDb(storage, fakeSeed)
    expect(db.read().users).toHaveLength(1)
    expect(JSON.parse(storage.getItem(DB_KEY)!).version).toBe(DB_VERSION)
  })

  it('reseeds when the saved version differs', () => {
    const storage = memoryStorage({ [DB_KEY]: JSON.stringify({ ...fakeSeed(new Date()), version: 0, users: [] }) })
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
    a.update((d) => { d.reads.c1 = 'A' })
    b.update((d) => { d.reads.c2 = 'B' })
    expect(a.read().reads).toEqual({ c1: 'A', c2: 'B' })
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
    db.update((d) => { d.reads.c1 = 'T' })
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
