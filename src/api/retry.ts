import { ApiError } from '@/lib/apiError'

/** Retry a failed load twice, except for a 404: retrying won't make a missing thing appear. */
export const retryUnlessNotFound = (failureCount: number, error: Error): boolean =>
  !(error instanceof ApiError && error.status === 404) && failureCount < 2
