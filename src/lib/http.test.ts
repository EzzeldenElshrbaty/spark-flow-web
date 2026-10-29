import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/apiError'
import { createHttpApi, request } from '@/lib/http'
import { parseBody } from '@/lib/messageBody'

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
  it('maps the M2 time calls to their routes, methods and bodies', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    const entry = { taskId: 't1', startedAt: 's', endedAt: 'e', note: '' }
    await api.time.today()
    await api.time.checkIn({ plan: 'p', target: { taskId: 't1' } })
    await api.time.checkOut()
    await api.time.start({ projectId: 'p1' })
    await api.time.stop()
    await api.time.addManual(entry)
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET /api/time/today',
      'POST /api/time/check-in',
      'POST /api/time/check-out',
      'POST /api/time/start',
      'POST /api/time/stop',
      'POST /api/time/entries',
    ])
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ plan: 'p', target: { taskId: 't1' } })
    expect(JSON.parse(String(calls[3].init?.body))).toEqual({ projectId: 'p1' })
    expect(JSON.parse(String(calls[5].init?.body))).toEqual(entry)
  })

  it('maps the chat writes', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.chat.send('c1', 'hi')
    await api.chat.reply('m1', 'ok')
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual(['POST /api/channels/c1/messages', 'POST /api/messages/m1/replies'])
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ content: 'hi' })
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ content: 'ok' })
  })

  it('sends the message body with the text (spec 6.8: mentions, links and formatting live in the body)', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    const body = parseBody('*hi* @all')
    await api.chat.send('c1', 'hi @all', 'k1', body)
    await api.chat.send('c1', 'plain', undefined, body)
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ content: 'hi @all', clientId: 'k1', body })
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ content: 'plain', body })
  })

  it('asks for older messages before a seq with before=, not a made-up cursor (spec §8)', async () => {
    const { calls, fetchFn } = recordingFetch(() => Response.json({ items: [], nextCursor: null }))
    const api = createHttpApi(fetchFn)
    await api.chat.messagesBefore('c1', 12)
    expect(calls.map((c) => c.url)).toEqual(['/api/channels/c1/messages?before=12'])
  })

  it('maps the comments calls', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.comments.list('NEX-1')
    await api.comments.create({ taskKey: 'NEX-1', kind: 'bug', body: 'b', files: [Object.assign(new Blob(['x']), { name: 'a.png' })] })
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual(['GET /api/tasks/NEX-1/comments', 'POST /api/tasks/NEX-1/comments'])
    const form = calls[1].init?.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect([form.get('kind'), form.get('body'), (form.getAll('files')[0] as File).name]).toEqual(['bug', 'b', 'a.png'])
  })

  it('maps the mentions calls', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.mentions.mine()
    await api.mentions.markRead(['m1'])
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual(['GET /api/mentions', 'POST /api/mentions/read'])
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ ids: ['m1'] })
  })

  it('maps the dashboard calls', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.dashboard.projects('w1')
    await api.dashboard.checkedIn('w1')
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual(['GET /api/workspaces/w1/dashboard', 'GET /api/workspaces/w1/dashboard/checked-in'])
  })

  it('maps the time report', async () => {
    const { calls, fetchFn } = recordingFetch()
    await createHttpApi(fetchFn).time.report('w1', 30)
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual(['GET /api/workspaces/w1/time-report?days=30'])
  })

  it('maps the rates calls', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.rates.list()
    await api.rates.update('u 3', 320)
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual(['GET /api/rates', 'PUT /api/rates/u%203'])
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ hourlyCost: 320 })
  })

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
    await api.time.list('p1')
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
      'GET /api/projects/p1/time',
      'GET /api/projects/p1/files',
      'POST /api/projects/p1/files',
    ])
    expect(JSON.parse(String(calls[3].init?.body))).toEqual({ name: 'M' })
    expect(calls[3].init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(calls[8].init?.body))).toEqual({ ids: ['ph2', 'ph1'] })
    expect(calls[17].init?.body).toBeInstanceOf(FormData)
  })

  it('reactions are a set (PUT) and an unset (DELETE) by emoji, and a reply carries its client id (spec §8)', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.chat.react({ kind: 'message', id: 'm1' }, '👍', true)
    await api.chat.react({ kind: 'reply', id: 'r1' }, '👍🏽', false)
    await api.chat.reply('m1', 'hi', undefined, false, undefined, 'k9')
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url} ${String(c.init?.body)}`)).toEqual([
      `PUT /api/messages/m1/reactions/${encodeURIComponent('👍')} undefined`,
      `DELETE /api/replies/r1/reactions/${encodeURIComponent('👍🏽')} undefined`,
      'POST /api/messages/m1/replies {"content":"hi","clientId":"k9"}',
    ])
  })

  it('sends the read seq, the client id, and my channel flags (spec §8)', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.chat.markRead('c1', 7)
    await api.chat.markUnread('c1', 5)
    await api.chat.send('c1', 'hi', 'k1')
    await api.chat.setStarred('c1', true)
    await api.chat.setMuted('c1', false)
    await api.chat.messagesAfter('c1', '12')
    await api.chat.jumpTarget('c1', '2026-10-28T00:00:00.000Z')
    await api.chat.jumpTarget('c1', null)
    await api.chat.linkPreview('https://github.com/a?b=1')
    await api.chat.drafts('w1')
    await api.chat.saveDraft('c1', [], 'm1')
    await api.chat.restore({ kind: 'message', id: 'm1' })
    await api.chat.restore({ kind: 'reply', id: 'r1' })
    await api.chat.edit({ kind: 'message', id: 'm1' }, 'x', [])
    await api.chat.setFollowing('m1', true)
    await api.chat.setFollowing('m1', false)
    await api.chat.reply('m1', 'hi', [], true)
    await api.chat.setNotifyLevel('c1', 'none')
    await api.inbox.list('w1')
    await api.inbox.markRead('w1', ['a1'])
    await api.inbox.markRead('w1')
    await api.chat.addMembers('c1', ['u2', 'u3'])
    await api.chat.removeMember('c1', 'u 3')
    await api.chat.updateChannel('c1', { description: 'About', whoCanPost: 'admins' })
    await api.chat.addMembers('c1', ['u2'], ['sam@client.com'])
    await api.chat.invitations('c1')
    await api.chat.revokeInvitation('inv 1')
    await api.chat.send('c1', 'hi', 'k2', undefined, ['a1', 'a2'])
    await api.chat.reply('m1', 'hi', undefined, false, ['a1'])
    await api.files.details('a 1')
    await api.files.update('a1', { title: 'Scope' })
    await api.files.delete('a1')
    await api.files.share('a1', 'c2', 'Look')
    await api.files.removeFromProject('p1', 'a1')
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url} ${String(c.init?.body)}`)).toEqual([
      'POST /api/channels/c1/read {"seq":7}',
      'POST /api/channels/c1/unread {"seq":5}',
      'POST /api/channels/c1/messages {"content":"hi","clientId":"k1"}',
      'PATCH /api/channels/c1/me {"starred":true}',
      'PATCH /api/channels/c1/me {"muted":false}',
      'GET /api/channels/c1/messages?after=12 undefined',
      'GET /api/channels/c1/messages/first?since=2026-10-28T00%3A00%3A00.000Z undefined',
      'GET /api/channels/c1/messages/first undefined',
      'GET /api/link-preview?url=https%3A%2F%2Fgithub.com%2Fa%3Fb%3D1 undefined',
      'GET /api/workspaces/w1/drafts undefined',
      'PUT /api/channels/c1/draft {"body":[],"rootId":"m1"}',
      'POST /api/messages/m1/restore undefined',
      'POST /api/replies/r1/restore undefined',
      'PATCH /api/messages/m1 {"content":"x","body":[]}',
      'PUT /api/messages/m1/follow undefined',
      'DELETE /api/messages/m1/follow undefined',
      'POST /api/messages/m1/replies {"content":"hi","body":[],"alsoInChannel":true}',
      'PATCH /api/channels/c1/me {"notifyLevel":"none"}',
      'GET /api/workspaces/w1/activity undefined',
      'POST /api/workspaces/w1/activity/read {"ids":["a1"]}',
      'POST /api/workspaces/w1/activity/read undefined',
      'POST /api/channels/c1/members {"userIds":["u2","u3"]}',
      'DELETE /api/channels/c1/members/u%203 undefined',
      'PATCH /api/channels/c1 {"description":"About","whoCanPost":"admins"}',
      'POST /api/channels/c1/members {"userIds":["u2"],"emails":["sam@client.com"]}',
      'GET /api/channels/c1/invitations undefined',
      'DELETE /api/invitations/inv%201 undefined',
      'POST /api/channels/c1/messages {"content":"hi","clientId":"k2","fileIds":["a1","a2"]}',
      'POST /api/messages/m1/replies {"content":"hi","fileIds":["a1"]}',
      'GET /api/files/a%201/details undefined',
      'PATCH /api/files/a1 {"title":"Scope"}',
      'DELETE /api/files/a1 undefined',
      'POST /api/files/a1/share {"channelId":"c2","content":"Look"}',
      'DELETE /api/projects/p1/files/a1 undefined',
    ])
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
    await api.projects.list('w1')
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
      'GET /api/projects/p1/tasks',
      'GET /api/tasks/NEX-101',
    ])
  })

  it('encodes ids and keys that carry reserved characters', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.tickets.get('A/B?c')
    await api.chat.channel('a b')
    expect(calls.map((c) => c.url)).toEqual(['/api/tasks/A%2FB%3Fc', '/api/channels/a%20b'])
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

describe('request credentials', () => {
  it('requests send cookies', async () => {
    const { calls, fetchFn } = recordingFetch()
    await request('/api/me', undefined, fetchFn)
    expect(calls[0]!.init?.credentials).toBe('include')
  })
})

describe('time zone', () => {
  it('every request sends X-Time-Zone', async () => {
    const { calls, fetchFn } = recordingFetch()
    await request('/api/time/today', undefined, fetchFn)
    await request('/api/time/check-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, fetchFn)
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    for (const c of calls) expect(new Headers(c.init?.headers).get('X-Time-Zone')).toBe(zone)
  })
})

describe('uploading a chat file over HTTP (spec §8)', () => {
  /** A stand-in for XMLHttpRequest that reports two progress steps, then answers `status`. */
  function fakeXhr(status = 200) {
    const sent: { method: string; url: string; body: unknown; headers: Record<string, string> }[] = []
    class Fake {
      upload = { onprogress: null as ((e: { loaded: number; total: number; lengthComputable: boolean }) => void) | null }
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      status = 0
      private call = { method: '', url: '', body: null as unknown, headers: {} as Record<string, string> }
      open(method: string, url: string) { this.call.method = method; this.call.url = url }
      setRequestHeader(k: string, v: string) { this.call.headers[k] = v }
      send(body: unknown) {
        this.call.body = body
        sent.push(this.call)
        this.upload.onprogress?.({ loaded: 5, total: 10, lengthComputable: true })
        this.upload.onprogress?.({ loaded: 10, total: 10, lengthComputable: true })
        this.status = status
        queueMicrotask(() => this.onload?.())
      }
      abort() { this.onabort?.() }
    }
    return { sent, make: () => new Fake() as unknown as XMLHttpRequest }
  }

  it('asks for an upload link, sends the bytes there with progress, then marks it complete', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      const body = url.endsWith('/upload-url') ? { file: { id: 'a1' }, uploadUrl: 'https://storage.example/put/a1' } : { id: 'a1', scanStatus: 'clean' }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    const xhr = fakeXhr()
    const api = createHttpApi(fetchFn, xhr.make)
    const progress: number[] = []
    const blob = Object.assign(new Blob(['hello'], { type: 'text/plain' }), { name: 'log.txt' })
    const done = await api.files.uploadForChat('c1', blob, { onProgress: (p) => progress.push(p) })
    expect(done).toEqual({ id: 'a1', scanStatus: 'clean' })
    expect(calls.map((c) => `${c.init?.method} ${c.url.replace(/^.*?\/api/, '/api')} ${String(c.init?.body)}`)).toEqual([
      'POST /api/files/upload-url {"channelId":"c1","name":"log.txt","size":5,"mimeType":"text/plain"}',
      'POST /api/files/a1/complete undefined',
    ])
    expect(xhr.sent.map((c) => [c.method, c.url, c.headers['Content-Type']])).toEqual([['PUT', 'https://storage.example/put/a1', 'text/plain']])
    expect(progress).toEqual([0.5, 1])
  })

  it('a refused upload of the bytes says so', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ file: { id: 'a1' }, uploadUrl: 'https://storage.example/put/a1' }), { status: 200 })) as typeof fetch
    const api = createHttpApi(fetchFn, fakeXhr(403).make)
    const blob = Object.assign(new Blob(['x']), { name: 'x.txt' })
    await expect(api.files.uploadForChat('c1', blob)).rejects.toMatchObject({ status: 403, title: "Couldn't upload the file" })
  })
})
