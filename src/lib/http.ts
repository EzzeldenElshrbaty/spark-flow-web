import type { Api, AttendanceQuery, AuditFilter, ChatTarget, ProblemDetails } from '@/api/types'
import { apiUrl } from '@/lib/api'
import { ApiError } from '@/lib/apiError'

/** Reads a failed response into an ApiError. The backend sends ProblemDetails; anything else gets a plain sentence. */
async function toApiError(res: Response): Promise<ApiError> {
  let problem: Partial<ProblemDetails> = {}
  try {
    problem = await res.json()
  } catch {
    // not JSON (a proxy's error page, say): fall back to the status text
  }
  const fallback = res.statusText || 'Request failed'
  return new ApiError({
    title: typeof problem?.title === 'string' ? problem.title : fallback,
    status: res.status,
    detail: typeof problem?.detail === 'string' ? problem.detail : undefined,
  })
}

/** One call to the backend, as its successful response; a refusal or no answer fails with an ApiError. */
async function respond(path: string, init: RequestInit | undefined, fetchFn: typeof fetch, accept: string): Promise<Response> {
  let res: Response
  try {
    // The session is a cookie on the backend's own origin (assumed with the .NET team), so cross-origin calls carry it.
    // The person's zone: "today", check-ins and report weeks are worked out in it (spec §4.4).
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    res = await fetchFn(apiUrl(path), { credentials: 'include', ...init, headers: { Accept: accept, 'X-Time-Zone': zone, ...init?.headers } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error // cancelled on purpose, not a failure
    throw new ApiError({ title: "Couldn't reach the server", status: 0 })
  }
  if (!res.ok) throw await toApiError(res)
  return res
}

/** One call to the backend. Resolves with the JSON body (undefined when there is none); fails with an ApiError. */
export async function request<T>(path: string, init?: RequestInit, fetchFn: typeof fetch = fetch): Promise<T> {
  const res = await respond(path, init, fetchFn, 'application/json')
  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError({ title: 'Unexpected response from the server', status: res.status })
  }
}

/** A GET whose body is text as served (a CSV export), not JSON. */
export async function requestText(path: string, accept: string, fetchFn: typeof fetch = fetch): Promise<string> {
  return (await respond(path, undefined, fetchFn, accept)).text()
}

const enc = encodeURIComponent
/** A period ending today, for one person or everyone the viewer may see (Attendance, slice 5). */
const attendanceQuery = (q: AttendanceQuery) => `?days=${q.days}${q.userId ? `&userId=${enc(q.userId)}` : ''}`
/** `?a=1&b=2` from the set values, or '' when none are. */
const query = (values: Record<string, string | undefined>) => {
  const set = Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]))
  return set.length ? `?${new URLSearchParams(set).toString()}` : ''
}

/** The audit log's filter as query parameters (spec: GET /api/audit). */
const auditQuery = (f: AuditFilter) => ({
  q: f.q?.trim() || undefined,
  since: f.since ?? undefined,
  actor: f.actorId ?? undefined,
  recordType: f.recordType ?? undefined,
  result: f.result ?? undefined,
  group: f.group ?? undefined,
})

const targetPath = (target: ChatTarget) => `/api/${target.kind === 'reply' ? 'replies' : 'messages'}/${enc(target.id)}`

/** The Api over HTTP: one route per call, as the backend serves them. */
/** For the demo-only actions: the real backend refuses them. */
const mockOnly = (what: string): Promise<never> =>
  Promise.reject(new ApiError({ title: 'Not available', status: 400, detail: `${what} isn't available with the backend on.` }))

/**
 * PUTs a file's bytes to the storage address the API handed out, reporting progress (fetch can't report an upload's).
 * A refusal is an ApiError with storage's status; a cancel rejects with an AbortError.
 */
function putBytes(url: string, file: Blob, makeXhr: () => XMLHttpRequest, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Cancelled', 'AbortError'))
    const xhr = makeXhr()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError({ title: "Couldn't upload the file", status: xhr.status }))
    xhr.onerror = () => reject(new ApiError({ title: "Couldn't reach the server", status: 0 }))
    xhr.onabort = () => reject(new DOMException('Cancelled', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(file)
  })
}

export function createHttpApi(fetchFn?: typeof fetch, makeXhr: () => XMLHttpRequest = () => new XMLHttpRequest()): Api {
  const get = <T>(path: string) => request<T>(path, undefined, fetchFn)
  /** A JSON write: POST, PATCH or PUT with a body, or DELETE without one. */
  const send = <T>(method: string, path: string, body?: unknown) =>
    request<T>(
      path,
      body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
      fetchFn,
    )
  return {
    workspaces: { list: () => get('/api/workspaces') },
    users: {
      me: () => get('/api/users/me'),
      list: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/users`),
      viewAs: () => mockOnly('Viewing as another person'),
      directory: () => get('/api/users'),
      create: (input) => send('POST', '/api/users', input),
      update: (id, patch) => send('PATCH', `/api/users/${enc(id)}`, patch),
      deactivate: (id, reason) => send('POST', `/api/users/${enc(id)}/deactivate`, { reason }),
      reactivate: (id) => send('POST', `/api/users/${enc(id)}/reactivate`),
    },
    chat: {
      channels: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/channels`),
      channel: (id) => get(`/api/channels/${enc(id)}`),
      messages: (channelId, cursor) =>
        get(`/api/channels/${enc(channelId)}/messages${cursor ? `?cursor=${enc(cursor)}` : ''}`),
      messagesBefore: (channelId, seq) => get(`/api/channels/${enc(channelId)}/messages?before=${seq}`),
      messagesAfter: (channelId, cursor) => get(`/api/channels/${enc(channelId)}/messages?after=${enc(cursor)}`),
      drafts: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/drafts`),
      sent: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/sent`),
      saveDraft: (channelId, body, rootId = null) => send('PUT', `/api/channels/${enc(channelId)}/draft`, { body, rootId }),
      linkPreview: (url) => get(`/api/link-preview?url=${enc(url)}`),
      jumpTarget: (channelId, since) => get(`/api/channels/${enc(channelId)}/messages/first${since ? `?since=${enc(since)}` : ''}`),
      message: (id) => get(`/api/messages/${enc(id)}`),
      replies: (messageId) => get(`/api/messages/${enc(messageId)}/replies`),
      markRead: (channelId, seq) => send('POST', `/api/channels/${enc(channelId)}/read`, seq === undefined ? undefined : { seq }),
      markUnread: (channelId, seq) => send('POST', `/api/channels/${enc(channelId)}/unread`, { seq }),
      send: (channelId, content, clientId, body, fileIds) =>
        send('POST', `/api/channels/${enc(channelId)}/messages`, { content, ...(clientId && { clientId }), ...(body && { body }), ...(fileIds?.length && { fileIds }) }),
      reply: (messageId, content, body, alsoInChannel, fileIds, clientId) =>
        send('POST', `/api/messages/${enc(messageId)}/replies`, {
          content,
          ...(body && { body }),
          ...(alsoInChannel && { alsoInChannel: true }),
          ...(fileIds?.length && { fileIds }),
          ...(clientId && { clientId }),
        }),
      setFollowing: (messageId, following) => send<void>(following ? 'PUT' : 'DELETE', `/api/messages/${enc(messageId)}/follow`),
      setThreadMuted: (messageId, muted) => send<void>(muted ? 'PUT' : 'DELETE', `/api/messages/${enc(messageId)}/mute`),
      setNotifyLevel: (id, notifyLevel) => send('PATCH', `/api/channels/${enc(id)}/me`, { notifyLevel }),
      react: (target, emoji, on) => send<void>(on ? 'PUT' : 'DELETE', `${targetPath(target)}/reactions/${enc(emoji)}`),
      edit: (target, content, body) => send('PATCH', targetPath(target), body ? { content, body } : { content }),
      remove: (target) => send<void>('DELETE', targetPath(target)),
      restore: (target) => send<void>('POST', `${targetPath(target)}/restore`),
      openDm: (workspaceId, userIds) => send('POST', `/api/workspaces/${enc(workspaceId)}/dms`, { userIds }),
      createChannel: (input) => send('POST', `/api/workspaces/${enc(input.workspaceId)}/channels`, input),
      updateChannel: (id, patch) => send('PATCH', `/api/channels/${enc(id)}`, patch),
      archiveChannel: (id, reason) => send('POST', `/api/channels/${enc(id)}/archive`, { reason: reason ?? '' }),
      restoreChannel: (id) => send('POST', `/api/channels/${enc(id)}/restore`),
      join: (id) => send('POST', `/api/channels/${enc(id)}/join`),
      leave: (id) => send('POST', `/api/channels/${enc(id)}/leave`),
      addMembers: (id, userIds, emails) => send('POST', `/api/channels/${enc(id)}/members`, emails?.length ? { userIds, emails } : { userIds }),
      invitations: (channelId) => get(`/api/channels/${enc(channelId)}/invitations`),
      revokeInvitation: (id) => send('DELETE', `/api/invitations/${enc(id)}`),
      removeMember: (id, userId) => send('DELETE', `/api/channels/${enc(id)}/members/${enc(userId)}`),
      setStarred: (id, starred) => send('PATCH', `/api/channels/${enc(id)}/me`, { starred }),
      setMuted: (id, muted) => send('PATCH', `/api/channels/${enc(id)}/me`, { muted }),
    },
    tickets: {
      // One name for tasks on the wire: /tasks, for reads as for writes.
      sprints: (projectId) => get(`/api/projects/${enc(projectId)}/sprints`),
      list: (projectId, opts) => get(`/api/projects/${enc(projectId)}/tasks${opts?.archived ? '?archived=true' : ''}`),
      get: (key) => get(`/api/tasks/${enc(key)}`),
      resolve: (keys) => (keys.length ? get(`/api/tasks/resolve?keys=${keys.map(enc).join(',')}`) : Promise.resolve([])),
    },
    projects: {
      list: (workspaceId, opts) => get(`/api/workspaces/${enc(workspaceId)}/projects${opts?.archived ? '?archived=true' : ''}`),
      get: (workspaceId, key) => get(`/api/workspaces/${enc(workspaceId)}/projects/${enc(key)}`),
      create: (input) => send('POST', `/api/workspaces/${enc(input.workspaceId)}/projects`, input),
      update: (id, patch) => send('PATCH', `/api/projects/${enc(id)}`, patch),
      archive: (id, reason) => send('POST', `/api/projects/${enc(id)}/archive`, { reason: reason ?? '' }),
      restore: (id) => send('POST', `/api/projects/${enc(id)}/restore`),
      setBoard: (id, columns) => send('PUT', `/api/projects/${enc(id)}/board`, { columns }),
      addColumn: (projectId, input) => send('POST', `/api/projects/${enc(projectId)}/board/columns`, input),
      deleteColumn: (projectId, columnId, moveTo) => send('DELETE', `/api/projects/${enc(projectId)}/board/columns/${enc(columnId)}?moveTo=${enc(moveTo)}`),
    },
    phases: {
      list: (projectId) => get(`/api/projects/${enc(projectId)}/phases`),
      create: (input) => send('POST', `/api/projects/${enc(input.projectId)}/phases`, input),
      update: (id, patch) => send('PATCH', `/api/phases/${enc(id)}`, patch),
      remove: (id) => send<void>('DELETE', `/api/phases/${enc(id)}`),
      reorder: (projectId, ids) => send('PUT', `/api/projects/${enc(projectId)}/phases/order`, { ids }),
    },
    deliverables: {
      list: (projectId) => get(`/api/projects/${enc(projectId)}/deliverables`),
      create: (input) => send('POST', `/api/projects/${enc(input.projectId)}/deliverables`, input),
      update: (id, patch) => send('PATCH', `/api/deliverables/${enc(id)}`, patch),
      remove: (id) => send('DELETE', `/api/deliverables/${enc(id)}`),
    },
    tasks: {
      create: (input) => send('POST', `/api/projects/${enc(input.projectId)}/tasks`, input),
      update: (key, patch) => send('PATCH', `/api/tasks/${enc(key)}`, patch),
      moveTo: (key, status, index, visibleKeys) => send('POST', `/api/tasks/${enc(key)}/move`, { status, index, visibleKeys }),
      archive: (key, reason) => send('POST', `/api/tasks/${enc(key)}/archive`, { reason: reason ?? '' }),
      restore: (key) => send('POST', `/api/tasks/${enc(key)}/restore`),
    },
    teams: { list: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/teams`) },
    auth: {
      signIn: (email, password) => send('POST', '/api/auth/sign-in', { email, password }),
      signOut: () => send<void>('POST', '/api/auth/sign-out'),
      // The prototype's list; the backend has none.
      demoPeople: () => get('/api/auth/demo-people'),
    },
    attendance: {
      scope: () => get('/api/attendance/scope'),
      checkIns: (q) => get(`/api/attendance/check-ins${attendanceQuery(q)}`),
      day: (day, userId) => get(`/api/attendance/day?day=${enc(day)}${userId ? `&userId=${enc(userId)}` : ''}`),
      visits: (q) => get(`/api/attendance/visits${attendanceQuery(q)}`),
      report: (q) => get(`/api/attendance/report${attendanceQuery(q)}`),
      workHours: () => get('/api/settings/work-hours'),
      setWorkHours: (input) => send('PUT', '/api/settings/work-hours', input),
      ping: () => send<void>('POST', '/api/attendance/ping'),
    },
    time: {
      list: (projectId) => get(`/api/projects/${enc(projectId)}/time`),
      today: () => get('/api/time/today'),
      checkIn: (input) => send('POST', '/api/time/check-in', input),
      checkOut: (input) => send('POST', '/api/time/check-out', { location: input?.location ?? 'none' }),
      undoCheckOut: () => send('POST', '/api/time/check-out/undo'),
      start: (target) => send('POST', '/api/time/start', target),
      stop: () => send('POST', '/api/time/stop'),
      addManual: (entry) => send('POST', '/api/time/entries', entry),
      update: (id, patch) => send('PATCH', `/api/time/entries/${enc(id)}`, patch),
      remove: (id) => send<void>('DELETE', `/api/time/entries/${enc(id)}`),
      report: (workspaceId, days, opts) => get(`/api/workspaces/${enc(workspaceId)}/time-report?days=${days}${opts?.projectId ? `&projectId=${enc(opts.projectId)}` : ''}`),
    },
    activity: {
      forTask: (key) => get(`/api/tasks/${enc(key)}/history`),
      forProject: (projectId, cursor) => get(`/api/projects/${enc(projectId)}/history${cursor ? `?cursor=${enc(cursor)}` : ''}`),
    },
    comments: {
      list: (taskKey) => get(`/api/tasks/${enc(taskKey)}/comments`),
      create: ({ taskKey, kind, body, files }) => {
        const form = new FormData()
        form.append('kind', kind)
        form.append('body', body)
        for (const file of files) form.append('files', file, file.name)
        return request(`/api/tasks/${enc(taskKey)}/comments`, { method: 'POST', body: form }, fetchFn)
      },
      update: (id, body) => send('PATCH', `/api/comments/${enc(id)}`, { body }),
      remove: (id) => send<void>('DELETE', `/api/comments/${enc(id)}`),
    },
    dashboard: {
      projects: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/dashboard`),
      checkedIn: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/dashboard/checked-in`),
    },
    mentions: {
      mine: () => get('/api/mentions'),
      markRead: (ids) => send('POST', '/api/mentions/read', { ids }),
    },
    inbox: {
      list: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/activity`),
      markRead: (workspaceId, ids) => send<void>('POST', `/api/workspaces/${enc(workspaceId)}/activity/read`, ids ? { ids } : undefined),
    },
    scheduled: {
      list: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/scheduled`),
      create: (input) => send('POST', '/api/scheduled', input),
      update: (id, patch) => send('PATCH', `/api/scheduled/${enc(id)}`, patch),
      remove: (id) => send<void>('DELETE', `/api/scheduled/${enc(id)}`),
      sendNow: (id) => send('POST', `/api/scheduled/${enc(id)}/send-now`),
    },
    saved: {
      list: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/saved`),
      save: (target, remindAt) => send('PUT', '/api/saved', { target, ...(remindAt ? { remindAt } : {}) }),
      update: (id, patch) => send('PATCH', `/api/saved/${enc(id)}`, patch),
      remove: (id) => send<void>('DELETE', `/api/saved/${enc(id)}`),
      note: (channelId, text, remindAt) => send('POST', '/api/saved/notes', { channelId, text, remindAt }),
    },
    bookmarks: {
      list: (channelId) => get(`/api/channels/${enc(channelId)}/bookmarks`),
      add: (channelId, bookmark) => send('POST', `/api/channels/${enc(channelId)}/bookmarks`, bookmark),
      update: (id, patch) => send('PATCH', `/api/bookmarks/${enc(id)}`, patch),
      remove: (id) => send<void>('DELETE', `/api/bookmarks/${enc(id)}`),
    },
    folders: {
      list: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/folders`),
      create: (workspaceId, name) => send('POST', `/api/workspaces/${enc(workspaceId)}/folders`, { name }),
    },
    pins: {
      list: (channelId) => get(`/api/channels/${enc(channelId)}/pins`),
      pin: (messageId) => send<void>('PUT', `/api/messages/${enc(messageId)}/pin`),
      unpin: (messageId) => send<void>('DELETE', `/api/messages/${enc(messageId)}/pin`),
    },
    preferences: {
      get: () => get('/api/me/preferences'),
      update: (patch) => send('PATCH', '/api/me/preferences', patch),
    },
    audit: {
      list: (filter, cursor) => get(`/api/audit${query({ ...auditQuery(filter), cursor })}`),
      get: (seq) => get(`/api/audit/${seq}`),
      summary: (todayFrom) => get(`/api/audit/summary${query({ todayFrom })}`),
      export: (filter) => requestText(`/api/audit/export${query(auditQuery(filter))}`, 'text/csv', fetchFn),
      // The backend records a download when it serves the file; only the Time and cost CSV is made in the page.
      noteDownload: () => Promise.resolve(),
      noteExport: (what, detail) => send<void>('POST', '/api/audit/exports', { what, detail }),
    },
    archive: {
      list: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/archive`),
      setRetention: (days) => send('PUT', '/api/settings/archive-retention', { days }).then((r) => (r as { days: number }).days),
      deleteForGood: (type, id) => send<void>('DELETE', `/api/archive/${enc(type)}/${enc(id)}`),
    },
    roles: {
      list: () => get('/api/roles'),
      create: (input) => send('POST', '/api/roles', input),
      rename: (id, name) => send('PATCH', `/api/roles/${enc(id)}`, { name }),
      remove: (id) => send<void>('DELETE', `/api/roles/${enc(id)}`),
      saveGrants: (changes) => send('PUT', '/api/roles/grants', { changes }),
    },
    sidebar: {
      order: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/sidebar-order`),
      setOrder: (workspaceId, section, ids) => send<void>('PUT', `/api/workspaces/${enc(workspaceId)}/sidebar-order`, { section, ids }),
    },
    search: {
      run: (workspaceId, r) => {
        const params = new URLSearchParams({ q: r.q, type: r.tab, sort: r.sort })
        for (const id of r.from) params.append('from', id)
        if (r.in) params.set('in', r.in)
        if (r.has) params.set('has', r.has)
        if (r.thread) params.set('is', 'thread')
        if (r.after) params.set('after', r.after)
        if (r.before) params.set('before', r.before)
        params.set('tz', r.tz)
        if (r.cursor) params.set('cursor', r.cursor)
        return get(`/api/workspaces/${enc(workspaceId)}/search?${params}`)
      },
    },
    threads: {
      list: (workspaceId, cursor) => get(`/api/workspaces/${enc(workspaceId)}/threads${cursor ? `?cursor=${enc(cursor)}` : ''}`),
      markRead: (workspaceId, rootIds) => send<void>('POST', `/api/workspaces/${enc(workspaceId)}/threads/read`, { rootIds }),
    },
    rates: {
      list: () => get('/api/rates'),
      update: (userId, hourlyCost) => send('PUT', `/api/rates/${enc(userId)}`, { hourlyCost }),
    },
    files: {
      url: (id) => Promise.resolve(apiUrl(`/api/files/${enc(id)}`)),
      list: (projectId) => get(`/api/projects/${enc(projectId)}/files`),
      upload: (projectId, file, signal) => {
        const form = new FormData()
        form.append('file', file, file.name)
        return request(`/api/projects/${enc(projectId)}/files`, { method: 'POST', body: form, signal }, fetchFn)
      },
      removeFromProject: (projectId, fileId) => send('DELETE', `/api/projects/${enc(projectId)}/files/${enc(fileId)}`),
      // Three steps (spec §8): an upload link for the bytes, the bytes straight to storage, then complete (type check, scan).
      uploadForChat: async (channelId, file, { onProgress, signal, snippet } = {}) => {
        const json = (method: string, path: string, body?: unknown) =>
          request<never>(path, body === undefined ? { method, signal } : { method, signal, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }, fetchFn)
        const { file: created, uploadUrl } = await json('POST', '/api/files/upload-url', { channelId, name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream', ...(snippet && { snippet }) }) as { file: { id: string }; uploadUrl: string }
        await putBytes(uploadUrl, file, makeXhr, onProgress, signal)
        return json('POST', `/api/files/${enc(created.id)}/complete`)
      },
      shareable: (workspaceId, q) => get(`/api/workspaces/${enc(workspaceId)}/files${query({ q })}`),
      inChannel: (channelId, filter) => get(`/api/channels/${enc(channelId)}/files${query(filter)}`),
      details: (id) => get(`/api/files/${enc(id)}/details`),
      update: (id, patch) => send('PATCH', `/api/files/${enc(id)}`, patch),
      delete: (id) => send<void>('DELETE', `/api/files/${enc(id)}`),
      share: (id, channelId, content) => send('POST', `/api/files/${enc(id)}/share`, { channelId, ...(content && { content }) }),
    },
    // The demo data lives in the browser's mock database; the real backend has none of these.
    db: {
      export: () => mockOnly('Exporting demo data'),
      import: () => mockOnly('Importing demo data'),
      reset: () => mockOnly('Resetting demo data'),
    },
  }
}
