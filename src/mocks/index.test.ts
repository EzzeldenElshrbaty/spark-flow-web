import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'

// getMockApi caches its db, so each test loads a fresh copy of the module.
async function load() {
  vi.resetModules()
  const mod = await import('./index')
  const { latency } = await import('./latency')
  latency.min = latency.max = 0
  return mod
}

const legacyStorage = () => {
  const map = new Map([
    ['spark-flow.mockdb.v1', '{}'],
    ['spark-flow.mockdb.v1.read.c-frontend', 'T'],
    ['spark-flow.theme', 'dark'],
  ])
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getMockApi', () => {
  it('uses IndexedDB, removes the old localStorage database, caches the api and sets the dev helpers', async () => {
    const storage = legacyStorage()
    const win: Record<string, unknown> = { localStorage: storage }
    vi.stubGlobal('window', win)
    vi.stubGlobal('indexedDB', new IDBFactory())
    const { getMockApi } = await load()
    const api = getMockApi()
    expect(getMockApi()).toBe(api)
    expect((await api.users.me()).id).toBe('u-1')
    expect([...storage.map.keys()]).toEqual(['spark-flow.theme'])
    const dev = win.__sparkFlowDev as NonNullable<Window['__sparkFlowDev']>
    const ticket = await dev.createTicket({
      projectId: 'p-nex', title: 'From dev', description: '', status: 'todo', priority: 'low', storyPoints: null, assigneeId: null, sprintId: null,
    })
    expect((await api.tickets.get(ticket.key)).title).toBe('From dev') // bound to the same db
  })

  it('falls back to memory when localStorage and IndexedDB are blocked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const win = {}
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    vi.stubGlobal('window', win)
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    const { getMockApi } = await load()
    const api = getMockApi()
    expect((await api.workspaces.list()).length).toBeGreaterThan(0)
    await api.chat.markRead('c-frontend')
    expect((await api.chat.channel('c-frontend')).unreadCount).toBe(0) // writes stick
  })
})
