import type { ProblemDetails } from '@/api/types'

/** A failed API call. Built from the backend's ProblemDetails; the mock backend throws the same thing. */
export class ApiError extends Error {
  status: number
  title: string
  detail?: string

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title)
    this.name = 'ApiError'
    this.status = problem.status
    this.title = problem.title
    this.detail = problem.detail
  }
}
