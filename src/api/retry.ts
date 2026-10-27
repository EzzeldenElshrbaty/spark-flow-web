import { ApiError } from '@/lib/apiError'

/** Retry a failed load twice, except for a 404, 403 or 401: retrying won't make a missing thing appear, or let you in. */
export const retryUnlessNotFound = (failureCount: number, error: Error): boolean =>
  !(error instanceof ApiError && [401, 403, 404].includes(error.status)) && failureCount < 2
