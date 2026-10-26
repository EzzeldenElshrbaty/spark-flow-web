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
export function createHttpApi(fetchFn?: typeof fetch): Api {
  const get = <T>(path: string) => request<T>(path, undefined, fetchFn)
  return {
    workspaces: { list: () => get('/api/workspaces') },
    users: {
      me: () => get('/api/users/me'),
      list: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/users`),
    },
    chat: {
      channels: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/channels`),
      channel: (id) => get(`/api/channels/${enc(id)}`),
      messages: (channelId, cursor) =>
        get(`/api/channels/${enc(channelId)}/messages${cursor ? `?cursor=${enc(cursor)}` : ''}`),
      message: (id) => get(`/api/messages/${enc(id)}`),
      replies: (messageId) => get(`/api/messages/${enc(messageId)}/replies`),
      markRead: (channelId) => request<void>(`/api/channels/${enc(channelId)}/read`, { method: 'POST' }, fetchFn),
    },
    tickets: {
      projects: (workspaceId) => get(`/api/workspaces/${enc(workspaceId)}/projects`),
      sprints: (projectId) => get(`/api/projects/${enc(projectId)}/sprints`),
      list: (projectId) => get(`/api/projects/${enc(projectId)}/tickets`),
      get: (key) => get(`/api/tickets/${enc(key)}`),
    },
    dev: {
      // The demo data lives in the browser's mock database; the real backend has nothing to reset.
      resetDemoData: () =>
        Promise.reject(new ApiError({ title: 'Not available', status: 400, detail: "Demo data can't be reset with the backend on." })),
    },
  }
}
