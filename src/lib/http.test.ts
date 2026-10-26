import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/apiError'
import { createHttpApi, request } from '@/lib/http'

type Call = { url: string; init?: RequestInit }

/** A fetch that records every call and answers each with a canned Response. */
function recordingFetch(respond: () => Response = () => Response.json({})) {
  const calls: Call[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return respond()
  }) as typeof fetch
  return { calls, fetchFn }
}

const fetchReturning = (status: number, body: unknown, headers?: HeadersInit) =>
  (async () =>
    new Response(body === null ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers })) as typeof fetch

describe('createHttpApi', () => {
  it('maps calls to the HTTP routes', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.workspaces.list()
    await api.users.me()
    await api.users.list('w1')
    await api.chat.channels('w1')
    await api.chat.channel('c1')
    await api.chat.messages('c1')
    await api.chat.messages('c1', '2026-10-26T00:00:00Z')
    await api.chat.message('m1')
    await api.chat.replies('m1')
    await api.chat.markRead('c1')
    await api.tickets.projects('w1')
    await api.tickets.sprints('p1')
    await api.tickets.list('p1')
    await api.tickets.get('NEX-101')
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET /api/workspaces',
      'GET /api/users/me',
      'GET /api/workspaces/w1/users',
      'GET /api/workspaces/w1/channels',
      'GET /api/channels/c1',
      'GET /api/channels/c1/messages',
      'GET /api/channels/c1/messages?cursor=2026-10-26T00%3A00%3A00Z',
      'GET /api/messages/m1',
      'GET /api/messages/m1/replies',
      'POST /api/channels/c1/read',
      'GET /api/workspaces/w1/projects',
      'GET /api/projects/p1/sprints',
      'GET /api/projects/p1/tickets',
      'GET /api/tickets/NEX-101',
    ])
  })

  it('encodes ids and keys that carry reserved characters', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.tickets.get('A/B?c')
    await api.chat.channel('a b')
    expect(calls.map((c) => c.url)).toEqual(['/api/tickets/A%2FB%3Fc', '/api/channels/a%20b'])
  })

  it('returns the parsed body, and nothing for an empty one', async () => {
    const ws = [{ id: 'w1', slug: 'nex', name: 'Nexus' }]
    expect(await createHttpApi(fetchReturning(200, ws)).workspaces.list()).toEqual(ws)
    await expect(createHttpApi(fetchReturning(204, null)).chat.markRead('c1')).resolves.toBeUndefined()
  })

  it('rejects resetDemoData: the backend has no such route', async () => {
    const { calls, fetchFn } = recordingFetch()
    await expect(createHttpApi(fetchFn).db.reset()).rejects.toMatchObject({ name: 'ApiError', status: 400 })
    expect(calls).toEqual([])
  })
})

describe('request', () => {
  it('turns ProblemDetails into ApiError', async () => {
    const failing = fetchReturning(404, { title: 'Not found', status: 404, detail: "Ticket NEX-9 doesn't exist." })
    const error = await request('/api/x', undefined, failing).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, title: 'Not found', message: "Ticket NEX-9 doesn't exist." })
  })

  it('handles a non-JSON error body', async () => {
    const failing = fetchReturning(502, '<html>Bad gateway</html>', { 'Content-Type': 'text/html' })
    const error = await request('/api/x', undefined, failing).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 502 })
    expect((error as ApiError).title).toBeTruthy()
  })

  it('uses the status text as the title when the body is not JSON', async () => {
    const failing = (async () => new Response('nope', { status: 503, statusText: 'Service Unavailable' })) as typeof fetch
    await expect(request('/api/x', undefined, failing)).rejects.toMatchObject({ status: 503, title: 'Service Unavailable' })
  })

  it('handles a network failure', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    await expect(request('/api/x', undefined, down)).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      title: "Couldn't reach the server",
    })
  })

  it('lets an aborted request through as the abort it is', async () => {
    const aborted = (async () => {
      throw new DOMException('Aborted', 'AbortError')
    }) as typeof fetch
    await expect(request('/api/x', undefined, aborted)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('fails on a 2xx body that is not JSON', async () => {
    await expect(request('/api/x', undefined, fetchReturning(200, 'oops'))).rejects.toMatchObject({ name: 'ApiError', status: 200 })
  })
})
