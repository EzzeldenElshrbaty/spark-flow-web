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
  it('maps a channel’s page calls to the routes in the chat spec 6.14 contract', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.pages.get('c 1')
    await api.pages.save('c1', { body: [], baseVersion: 2 })
    await api.pages.editing('c1')
    await api.pages.stopEditing('c1')
    await api.pages.history('c1')
    await api.pages.version('c1', 'v1')
    await api.pages.restore('c1', { versionId: 'v1', baseVersion: 3 })
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET /api/channels/c%201/page',
      'PUT /api/channels/c1/page',
      'POST /api/channels/c1/page/editing',
      'DELETE /api/channels/c1/page/editing',
      'GET /api/channels/c1/page/versions',
      'GET /api/channels/c1/page/versions/v1',
      'POST /api/channels/c1/page/restore',
    ])
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ body: [], baseVersion: 2 })
    expect(JSON.parse(String(calls[6].init?.body))).toEqual({ versionId: 'v1', baseVersion: 3 })
    // Letting the page go may be the last thing a closing tab does (polish pass).
    expect(calls[3].init?.keepalive).toBe(true)
  })

  it('maps a channel’s task list calls (task list §4.3)', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.taskLists.get('c-1')
    await api.taskLists.add('c-1', 'NEX-1')
    await api.taskLists.remove('c-1', 'NEX-1')
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET /api/channels/c-1/task-list',
      'POST /api/channels/c-1/task-list',
      'DELETE /api/channels/c-1/task-list/NEX-1',
    ])
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ taskKey: 'NEX-1' })
  })

  it('maps the M2 time calls to their routes, methods and bodies', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    const entry = { taskId: 't1', startedAt: 's', endedAt: 'e', note: '' }
    await api.time.today()
    await api.time.start({ projectId: 'p1' })
    await api.time.stop()
    await api.time.addManual(entry)
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET /api/time/today',
      'POST /api/time/start',
      'POST /api/time/stop',
      'POST /api/time/entries',
    ])
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ projectId: 'p1', location: 'none' })
    expect(JSON.parse(String(calls[3].init?.body))).toEqual(entry)
    // Time for someone else carries whose it is (add time for).
    await api.time.addManual({ ...entry, userId: 'u-3' })
    expect(JSON.parse(String(calls[4].init?.body))).toEqual({ ...entry, userId: 'u-3' })
    // Check-in, check-out and undo went with timer slice 3.
    for (const name of ['checkIn', 'checkOut', 'undoCheckOut']) expect(name in api.time).toBe(false)
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
    await api.dashboard.workingNow('w1')
    await api.dashboard.stats('w1')
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual(['GET /api/workspaces/w1/dashboard', 'GET /api/workspaces/w1/dashboard/working-now', 'GET /api/workspaces/w1/dashboard/stats'])
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

  it('maps the audit log: its filter as query parameters, the export as text, and only the CSV note (slice 2)', async () => {
    const calls: Call[] = []
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return String(input).includes('/export?') ? new Response('#,When\r\n', { headers: { 'Content-Type': 'text/csv' } }) : Response.json({})
    }) as typeof fetch
    const api = createHttpApi(fetchFn)
    await api.audit.list({ q: '  nexus ', since: '2026-10-24T00:00:00.000Z', actorId: 'u 1', recordType: null, result: 'refused', group: 'access' }, '340')
    await api.audit.list({})
    await api.audit.summary('2026-10-31T00:00:00.000Z')
    await api.audit.get(341)
    expect(await api.audit.export({ group: 'exports' })).toBe('#,When\r\n')
    await api.audit.noteDownload('a1')
    await api.audit.noteExport('timeCost', 'Last 7 days · All projects')
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET /api/audit?q=nexus&since=2026-10-24T00%3A00%3A00.000Z&actor=u+1&result=refused&group=access&cursor=340',
      'GET /api/audit',
      'GET /api/audit/summary?todayFrom=2026-10-31T00%3A00%3A00.000Z',
      'GET /api/audit/341',
      'GET /api/audit/export?group=exports',
      // The backend records a download when it serves the file, so the note sends nothing.
      'POST /api/audit/exports',
    ])
    expect(new Headers(calls[4].init?.headers).get('Accept')).toBe('text/csv')
    expect(JSON.parse(String(calls[5].init?.body))).toEqual({ what: 'timeCost', detail: 'Last 7 days · All projects' })
  })

  it('maps the archived records calls, and the "Why?" sent with an archive (slice 4)', async () => {
    const calls: Call[] = []
    const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return Response.json(String(input).includes('archive-retention') ? { days: 90 } : {})
    }) as typeof fetch
    const api = createHttpApi(fetchFn)
    await api.archive.list('ws 1')
    expect(await api.archive.setRetention(90)).toBe(90)
    await api.archive.deleteForGood('task', 'NEX-1')
    await api.projects.archive('p 1', 'Paused')
    await api.tasks.archive('NEX-2')
    await api.chat.archiveChannel('c 1', 'Done')
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url} ${c.init?.body ?? ''}`.trim())).toEqual([
      'GET /api/workspaces/ws%201/archive',
      'PUT /api/settings/archive-retention {"days":90}',
      'DELETE /api/archive/task/NEX-1',
      'POST /api/projects/p%201/archive {"reason":"Paused"}',
      'POST /api/tasks/NEX-2/archive {"reason":""}',
      'POST /api/channels/c%201/archive {"reason":"Done"}',
    ])
  })

  it('maps signing in and out (slice AB)', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.auth.signIn('nour.elsayed@spark-sys.com', 'secret')
    await api.auth.signOut()
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url} ${c.init?.body ?? ''}`.trim())).toEqual([
      'POST /api/auth/sign-in {"email":"nour.elsayed@spark-sys.com","password":"secret"}',
      'POST /api/auth/sign-out',
    ])
  })

  it('maps start, pause, resume and stop, with the place sent on start and resume (timer slice 1)', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.time.start({ taskId: 't1' }, { lat: 30, lng: 31, accuracy: 20 })
    await api.time.pause()
    await api.time.resume('blocked')
    await api.time.resume()
    await api.time.stop()
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url} ${c.init?.body ?? ''}`.trim())).toEqual([
      'POST /api/time/start {"taskId":"t1","location":{"lat":30,"lng":31,"accuracy":20}}',
      'POST /api/time/pause',
      'POST /api/time/resume {"location":"blocked"}',
      'POST /api/time/resume {"location":"none"}',
      'POST /api/time/stop',
    ])
  })

  it('maps the attendance calls (slice 5; days in timer slice 3)', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.attendance.scope()
    await api.attendance.days({ days: 7 })
    await api.attendance.day('2026-10-26', 'u 5')
    await api.attendance.visits({ days: 30, userId: 'u-2' })
    await api.attendance.report({ days: 90 })
    await api.attendance.workHours()
    await api.attendance.setWorkHours({ days: [0, 1], start: '09:00', end: '17:00' })
    await api.attendance.timer()
    await api.attendance.setTimer({ timeoutHours: 3 })
    await api.attendance.ping()
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url} ${c.init?.body ?? ''}`.trim())).toEqual([
      'GET /api/attendance/scope',
      'GET /api/attendance/days?days=7',
      'GET /api/attendance/day?day=2026-10-26&userId=u%205',
      'GET /api/attendance/visits?days=30&userId=u-2',
      'GET /api/attendance/report?days=90',
      'GET /api/settings/work-hours',
      'PUT /api/settings/work-hours {"days":[0,1],"start":"09:00","end":"17:00"}',
      'GET /api/settings/timer',
      'PUT /api/settings/timer {"timeoutHours":3}',
      'POST /api/attendance/ping',
    ])
    expect('checkIns' in api.attendance).toBe(false)
  })

  it('maps the people calls (slice 3)', async () => {
    const { calls, fetchFn } = recordingFetch()
    const api = createHttpApi(fetchFn)
    await api.users.directory()
    await api.users.create({ name: 'Laila Hamdy', email: 'laila@spark-sys.com', title: '', roleIds: ['member'], teamIds: [] })
    await api.users.update('u 3', { title: 'Lead' })
    await api.users.deactivate('u 3', 'Left')
    await api.users.reactivate('u 3')
    expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url} ${c.init?.body ?? ''}`.trim())).toEqual([
      'GET /api/users',
      'POST /api/users {"name":"Laila Hamdy","email":"laila@spark-sys.com","title":"","roleIds":["member"],"teamIds":[]}',
      'PATCH /api/users/u%203 {"title":"Lead"}',
      'POST /api/users/u%203/deactivate {"reason":"Left"}',
      'POST /api/users/u%203/reactivate',
    ])
  })

  it('a refused audit export fails as an ApiError, like any call', async () => {
    const api = createHttpApi(fetchReturning(403, { title: 'Forbidden', detail: "You don’t have access to the audit log." }))
    await expect(api.audit.export({})).rejects.toMatchObject({ status: 403, detail: "You don’t have access to the audit log." })
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
    await api.tasks.create({ projectId: 'p1', title: 'T', descriptionBody: [], status: 'todo', priority: 'low', storyPoints: null, assigneeId: null, sprintId: null })
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
    await api.preferences.get()
    await api.preferences.update({ desktop: true })
    await api.roles.list()
    await api.roles.create({ name: 'QA lead', copyFrom: 'member' })
    await api.roles.rename('r 1', 'QA')
    await api.roles.remove('r 1')
    await api.roles.saveGrants([{ roleId: 'member', add: ['projects.create'], remove: [] }])
    await api.teams.create('w1', 'Data')
    await api.teams.rename('t 1', 'QA')
    await api.teams.remove('t 1')
    await api.sidebar.order('w1')
    await api.sidebar.setOrder('w1', 'channels', ['c2', 'c1'])
    await api.threads.list('w1')
    await api.threads.list('w1', '20')
    await api.threads.markRead('w1', ['m1'])
    await api.search.run('w1', { q: 'deploy "page size"', tab: 'messages', sort: 'newest', from: ['u2', 'u3'], in: 'c1', has: 'file', thread: true, after: '2026-10-01', before: '2026-10-31', tz: 'Africa/Cairo', cursor: '20' })
    await api.search.run('w1', { q: '', tab: 'people', sort: 'relevant', from: [], in: null, has: null, thread: false, after: null, before: null, tz: 'UTC' })
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
      'GET /api/me/preferences undefined',
      'PATCH /api/me/preferences {"desktop":true}',
      'GET /api/roles undefined',
      'POST /api/roles {"name":"QA lead","copyFrom":"member"}',
      'PATCH /api/roles/r%201 {"name":"QA"}',
      'DELETE /api/roles/r%201 undefined',
      'PUT /api/roles/grants {"changes":[{"roleId":"member","add":["projects.create"],"remove":[]}]}',
      'POST /api/workspaces/w1/teams {"name":"Data"}',
      'PATCH /api/teams/t%201 {"name":"QA"}',
      'DELETE /api/teams/t%201 undefined',
      'GET /api/workspaces/w1/sidebar-order undefined',
      'PUT /api/workspaces/w1/sidebar-order {"section":"channels","ids":["c2","c1"]}',
      'GET /api/workspaces/w1/threads undefined',
      'GET /api/workspaces/w1/threads?cursor=20 undefined',
      'POST /api/workspaces/w1/threads/read {"rootIds":["m1"]}',
      'GET /api/workspaces/w1/search?q=deploy+%22page+size%22&type=messages&sort=newest&from=u2&from=u3&in=c1&has=file&is=thread&after=2026-10-01&before=2026-10-31&tz=Africa%2FCairo&cursor=20 undefined',
      'GET /api/workspaces/w1/search?q=&type=people&sort=relevant&tz=UTC undefined',
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
    const failing = fetchReturning(404, { title: 'Not found', status: 404, detail: "Ticket NEX-9 doesn’t exist." })
    const error = await request('/api/x', undefined, failing).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, title: 'Not found', message: "Ticket NEX-9 doesn’t exist." })
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
      title: "Couldn’t reach the server",
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
    await request('/api/time/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, fetchFn)
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

  it('a project’s files are read with their filter as a query', async () => {
    const urls: string[] = []
    const fetchFn = (async (url: string) => {
      urls.push(url.replace(/^.*?\/api/, '/api'))
      return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 })
    }) as typeof fetch
    await createHttpApi(fetchFn, fakeXhr().make).files.inProject('p-nex', { from: 'chat', type: 'pdf', cursor: '50' })
    expect(urls).toEqual(['/api/projects/p-nex/all-files?from=chat&type=pdf&cursor=50'])
  })

  it('a task file asks for its upload link with the project, then the same steps', async () => {
    const calls: string[] = []
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url.replace(/^.*?\/api/, '/api')} ${String(init?.body)}`)
      const body = url.endsWith('/upload-url') ? { file: { id: 'a1' }, uploadUrl: 'https://storage.example/put/a1' } : { id: 'a1' }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    const xhr = fakeXhr()
    const api = createHttpApi(fetchFn, xhr.make)
    const blob = Object.assign(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { name: 'flow.pdf' })
    await api.files.uploadForTask('p-nex', blob)
    expect(calls).toEqual(['POST /api/files/upload-url {"projectId":"p-nex","name":"flow.pdf","size":8,"mimeType":"application/pdf"}', 'POST /api/files/a1/complete undefined'])
    expect(xhr.sent.map((c) => c.method)).toEqual(['PUT'])
  })

  it('a snippet sends its language with the upload link request (spec 6.9)', async () => {
    const calls: string[] = []
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push(String(init?.body))
      const body = url.endsWith('/upload-url') ? { file: { id: 'a1' }, uploadUrl: 'https://storage.example/put/a1' } : { id: 'a1' }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    const api = createHttpApi(fetchFn, fakeXhr().make)
    const blob = Object.assign(new Blob(['SELECT 1;'], { type: 'text/plain' }), { name: 'q.txt' })
    await api.files.uploadForChat('c1', blob, { snippet: { language: 'sql' } })
    expect(calls[0]).toBe('{"channelId":"c1","name":"q.txt","size":9,"mimeType":"text/plain","snippet":{"language":"sql"}}')
  })

  it('a voice message sends its clip with the upload link request (chat spec 6.9)', async () => {
    const calls: string[] = []
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push(String(init?.body))
      const body = url.endsWith('/upload-url') ? { file: { id: 'a1' }, uploadUrl: 'https://storage.example/put/a1' } : { id: 'a1' }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    const api = createHttpApi(fetchFn, fakeXhr().make)
    const blob = Object.assign(new Blob(['ogg'], { type: 'audio/webm' }), { name: 'Voice message.webm' })
    await api.files.uploadForChat('c1', blob, { clip: { kind: 'voice', durationMs: 4000, waveform: [0.5] } })
    expect(JSON.parse(calls[0]!)).toMatchObject({ channelId: 'c1', clip: { kind: 'voice', durationMs: 4000, waveform: [0.5] } })
  })

  it('a refused upload of the bytes says so', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ file: { id: 'a1' }, uploadUrl: 'https://storage.example/put/a1' }), { status: 200 })) as typeof fetch
    const api = createHttpApi(fetchFn, fakeXhr(403).make)
    const blob = Object.assign(new Blob(['x']), { name: 'x.txt' })
    await expect(api.files.uploadForChat('c1', blob)).rejects.toMatchObject({ status: 403, title: "Couldn’t upload the file" })
  })
})
