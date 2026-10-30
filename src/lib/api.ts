import type { Api } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { createHttpApi } from '@/lib/http'
import { getMockApi } from '@/mocks'

export { ApiError }

/** True when the build talks to the real backend; false for the prototype, which runs on the mock database. */
export const backendOn = import.meta.env.VITE_BACKEND === 'on'

/** The URL for an API path: prefixed with VITE_API_URL when the backend is on, as it is otherwise. */
export function apiUrl(path: string): string {
  if (!backendOn) return path
  const base = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
  return base + path
}

let resolved: Api | undefined
// Picked on first use, not on import: the mock database reads `window`, which tests in Node don't have.
const resolve = (): Api => (resolved ??= backendOn ? createHttpApi() : getMockApi())

/** What every page and hook calls. The mock backend and the HTTP client both fit `Api`, so callers can't tell which. */
export const api: Api = {
  get workspaces() { return resolve().workspaces },
  get users() { return resolve().users },
  get chat() { return resolve().chat },
  get tickets() { return resolve().tickets },
  get projects() { return resolve().projects },
  get phases() { return resolve().phases },
  get deliverables() { return resolve().deliverables },
  get tasks() { return resolve().tasks },
  get teams() { return resolve().teams },
  get time() { return resolve().time },
  get rates() { return resolve().rates },
  get comments() { return resolve().comments },
  get activity() { return resolve().activity },
  get mentions() { return resolve().mentions },
  get inbox() { return resolve().inbox },
  get saved() { return resolve().saved },
  get scheduled() { return resolve().scheduled },
  get pins() { return resolve().pins },
  get threads() { return resolve().threads },
  get folders() { return resolve().folders },
  get bookmarks() { return resolve().bookmarks },
  get dashboard() { return resolve().dashboard },
  get files() { return resolve().files },
  get db() { return resolve().db },
}
