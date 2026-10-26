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
  it('maps the M1 writes to their routes, methods and bodies', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    const project = { workspaceId: 'w1', name: 'N', key: 'NEW', clientName: '', description: '', links: [], managerId: 'u', memberIds: [], teamIds: [], methodology: 'waterfall' as const, startDate: 's', dueDate: 'd' }
    await api.projects.list('w1')
    await api.projects.get('w1', 'NEX')
    await api.projects.create(project)
    await api.projects.update('p1', { name: 'M' })
    await api.phases.list('p1')
    await api.phases.create({ projectId: 'p1', name: 'QA', startDate: 's', dueDate: 'd' })
    await api.phases.update('ph1', { name: 'QA 2' })
    await api.phases.remove('ph1')
    await api.phases.reorder('p1', ['ph2', 'ph1'])
    await api.deliverables.list('p1')
    await api.deliverables.create({ projectId: 'p1', phaseId: null, title: 'T', dueDate: 'd' })
    await api.deliverables.update('d1', { doneAt: 'x' })
    await api.tasks.create({ projectId: 'p1', title: 'T', description: '', status: 'todo', priority: 'low', storyPoints: null, assigneeId: null, sprintId: null })
    await api.tasks.update('NEX-1', { status: 'done' })
    await api.teams.list('w1')
    await api.files.list('p1')
    await api.files.upload('p1', Object.assign(new Blob(['%PDF-']), { name: 'a.pdf' }))
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET /api/workspaces/w1/projects',
      'GET /api/workspaces/w1/projects/NEX',
      'POST /api/workspaces/w1/projects',
      'PATCH /api/projects/p1',
      'GET /api/projects/p1/phases',
      'POST /api/projects/p1/phases',
      'PATCH /api/phases/ph1',
      'DELETE /api/phases/ph1',
      'PUT /api/projects/p1/phases/order',
      'GET /api/projects/p1/deliverables',
      'POST /api/projects/p1/deliverables',
      'PATCH /api/deliverables/d1',
      'POST /api/projects/p1/tasks',
      'PATCH /api/tasks/NEX-1',
      'GET /api/workspaces/w1/teams',
      'GET /api/projects/p1/files',
      'POST /api/projects/p1/files',
    ])
    expect(JSON.parse(String(calls[3].init?.body))).toEqual({ name: 'M' })
    expect(calls[3].init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(calls[8].init?.body))).toEqual({ ids: ['ph2', 'ph1'] })
    expect(calls[16].init?.body).toBeInstanceOf(FormData)
  })

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
