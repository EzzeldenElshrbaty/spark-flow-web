import { describe, expect, it } from 'vitest'
import { retryUnlessNotFound } from '@/api/retry'
import { ApiError } from '@/lib/apiError'

describe('retryUnlessNotFound', () => {
  it('retries twice, then stops', () => {
    const down = new ApiError({ title: 'Bad gateway', status: 502 })
    expect([0, 1, 2].map((count) => retryUnlessNotFound(count, down))).toEqual([true, true, false])
  })

  it('never retries a 404', () => {
    expect(retryUnlessNotFound(0, new ApiError({ title: 'Not found', status: 404 }))).toBe(false)
  })

  it('never retries a 403: asking again does not let you in', () => {
    expect(retryUnlessNotFound(0, new ApiError({ title: 'Forbidden', status: 403 }))).toBe(false)
  })

  it('retries other errors, such as a network failure', () => {
    expect(retryUnlessNotFound(0, new TypeError('Failed to fetch'))).toBe(true)
  })
})
