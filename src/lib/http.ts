import type { Api, ProblemDetails } from '@/api/types'
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

/** One call to the backend. Resolves with the JSON body (undefined when there is none); fails with an ApiError. */
export async function request<T>(path: string, init?: RequestInit, fetchFn: typeof fetch = fetch): Promise<T> {
  let res: Response
  try {
    res = await fetchFn(apiUrl(path), { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error // cancelled on purpose, not a failure
    throw new ApiError({ title: "Couldn't reach the server", status: 0 })
  }
  if (!res.ok) throw await toApiError(res)
  const text = await res.text()
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError({ title: 'Unexpected response from the server', status: res.status })
  }
}

const enc = encodeURIComponent

/** The Api over HTTP: one route per call, as the backend serves them. */
/** For the demo-only actions: the real backend refuses them. */
const mockOnly = (what: string): Promise<never> =>
  Promise.reject(new ApiError({ title: 'Not available', status: 400, detail: `${what} isn't available with the backend on.` }))

export function createHttpApi(fetchFn?: typeof fetch): Api {
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
    },
    chat: {
      channels: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/channels`),
      channel: (id) => get(`/api/channels/${enc(id)}`),
      messages: (channelId, cursor) =>
        get(`/api/channels/${enc(channelId)}/messages${cursor ? `?cursor=${enc(cursor)}` : ''}`),
      message: (id) => get(`/api/messages/${enc(id)}`),
      replies: (messageId) => get(`/api/messages/${enc(messageId)}/replies`),
      markRead: (channelId) => request<void>(`/api/channels/${enc(channelId)}/read`, { method: 'POST' }, fetchFn),
      send: (channelId, content) => send('POST', `/api/channels/${enc(channelId)}/messages`, { content }),
      reply: (messageId, content) => send('POST', `/api/messages/${enc(messageId)}/replies`, { content }),
    },
    tickets: {
      projects: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/projects`),
      sprints: (projectId) => get(`/api/projects/${enc(projectId)}/sprints`),
      list: (projectId) => get(`/api/projects/${enc(projectId)}/tickets`),
      get: (key) => get(`/api/tickets/${enc(key)}`),
    },
    projects: {
      list: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/projects`),
      get: (workspaceId, key) => get(`/api/workspaces/${enc(workspaceId)}/projects/${enc(key)}`),
      create: (input) => send('POST', `/api/workspaces/${enc(input.workspaceId)}/projects`, input),
      update: (id, patch) => send('PATCH', `/api/projects/${enc(id)}`, patch),
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
    },
    tasks: {
      create: (input) => send('POST', `/api/projects/${enc(input.projectId)}/tasks`, input),
      update: (key, patch) => send('PATCH', `/api/tasks/${enc(key)}`, patch),
    },
    teams: { list: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/teams`) },
    time: {
      list: (projectId) => get(`/api/projects/${enc(projectId)}/time`),
      today: () => get('/api/time/today'),
      checkIn: (input) => send('POST', '/api/time/check-in', input),
      checkOut: () => send('POST', '/api/time/check-out'),
      start: (target) => send('POST', '/api/time/start', target),
      stop: () => send('POST', '/api/time/stop'),
      addManual: (entry) => send('POST', '/api/time/entries', entry),
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
    },
    mentions: {
      mine: () => get('/api/mentions'),
      markRead: (ids) => send('POST', '/api/mentions/read', { ids }),
    },
    rates: {
      list: () => get('/api/rates'),
      update: (userId, hourlyCost) => send('PUT', `/api/rates/${enc(userId)}`, { hourlyCost }),
    },
    files: {
      url: (id) => Promise.resolve(apiUrl(`/api/files/${enc(id)}`)),
      list: (projectId) => get(`/api/projects/${enc(projectId)}/files`),
      upload: (projectId, file) => {
        const form = new FormData()
        form.append('file', file, file.name)
        return request(`/api/projects/${enc(projectId)}/files`, { method: 'POST', body: form }, fetchFn)
      },
    },
    // The demo data lives in the browser's mock database; the real backend has none of these.
    db: {
      export: () => mockOnly('Exporting demo data'),
      reloadSeed: () => mockOnly('Reloading demo data'),
      reset: () => mockOnly('Resetting demo data'),
    },
  }
}
