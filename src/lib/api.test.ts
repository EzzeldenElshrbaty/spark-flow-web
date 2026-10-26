import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Api } from '@/api/types'

const fakeMockApi = { workspaces: { list: vi.fn(async () => []) }, users: {}, chat: {}, tickets: {}, files: {}, db: {} } as unknown as Api
const getMockApi = vi.fn(() => fakeMockApi)
vi.mock('@/mocks', () => ({ getMockApi }))

// backendOn is read when the module loads, so each test loads a fresh copy.
async function load() {
  vi.resetModules()
  return import('./api')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('lib/api', () => {
  it('does not touch window, or build the mock api, when it is imported', async () => {
    expect(typeof window).toBe('undefined') // this suite runs in Node
    const { api } = await load()
    expect(api).toBeDefined()
    expect(getMockApi).not.toHaveBeenCalled()
  })

  it('builds the mock api on first use, once', async () => {
    const { api, backendOn } = await load()
    expect(backendOn).toBe(false)
    expect(api.workspaces).toBe(fakeMockApi.workspaces)
    expect(api.chat).toBe(fakeMockApi.chat)
    expect(getMockApi).toHaveBeenCalledTimes(1)
  })

  it('leaves paths alone when the backend is off', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com')
    const { apiUrl } = await load()
    expect(apiUrl('/api/workspaces')).toBe('/api/workspaces')
  })

  it('prefixes paths with VITE_API_URL when the backend is on', async () => {
    vi.stubEnv('VITE_BACKEND', 'on')
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/')
    const { apiUrl, backendOn } = await load()
    expect(backendOn).toBe(true)
    expect(apiUrl('/api/workspaces')).toBe('https://api.example.com/api/workspaces')
  })

  it('uses the HTTP client, not the mock, when the backend is on', async () => {
    vi.stubEnv('VITE_BACKEND', 'on')
    vi.stubEnv('VITE_API_URL', 'https://api.example.com')
    const fetchSpy = vi.fn(async () => Response.json([]))
    vi.stubGlobal('fetch', fetchSpy)
    const { api } = await load()
    await api.workspaces.list()
    expect(fetchSpy).toHaveBeenCalledWith('https://api.example.com/api/workspaces', expect.anything())
    expect(getMockApi).not.toHaveBeenCalled()
    await expect(api.db.reset()).rejects.toMatchObject({ status: 400 })
  })
})
