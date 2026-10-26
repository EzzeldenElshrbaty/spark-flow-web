import { afterEach, describe, expect, it, vi } from 'vitest'

// getMockApi caches its db, so each test loads a fresh copy of the module.
async function load() {
  vi.resetModules()
  return import('./index')
}

const fakeStorage = () => {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getMockApi', () => {
  it('uses window.localStorage, caches the api and sets the dev helpers', async () => {
    const storage = fakeStorage()
    const win: Record<string, unknown> = { localStorage: storage }
    vi.stubGlobal('window', win)
    const { getMockApi } = await load()
    const { latency } = await import('./latency')
    latency.min = latency.max = 0
    const api = getMockApi()
    expect(getMockApi()).toBe(api)
    expect((await api.users.me()).id).toBe('u-1')
    expect(storage.map.has('spark-flow.mockdb.v1')).toBe(true)
    const dev = win.__sparkFlowDev as NonNullable<Window['__sparkFlowDev']>
    const ticket = await dev.createTicket({
      projectId: 'p-nex', title: 'From dev', description: '', status: 'todo', priority: 'low', storyPoints: null, assigneeId: null, sprintId: null,
    })
    expect((await api.tickets.get(ticket.key)).title).toBe('From dev') // bound to the same db
  })

  it('falls back to memory when reading window.localStorage throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const win = {}
    Object.defineProperty(win, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError') } })
    vi.stubGlobal('window', win)
    const { getMockApi } = await load()
    const { latency } = await import('./latency')
    latency.min = latency.max = 0
    const api = getMockApi()
    expect((await api.workspaces.list()).length).toBeGreaterThan(0)
    await api.chat.markRead('c-frontend')
    expect((await api.chat.channel('c-frontend')).unreadCount).toBe(0) // writes stick
  })
})
