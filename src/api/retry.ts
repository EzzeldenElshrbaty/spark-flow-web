import { ApiError } from '@/lib/apiError'

/** Retry a failed load twice, except for a 404 or 403: retrying won't make a missing thing appear, or let you in. */
export const retryUnlessNotFound = (failureCount: number, error: Error): boolean =>
  !(error instanceof ApiError && (error.status === 404 || error.status === 403)) && failureCount < 2
