import { describe, expect, it } from 'vitest'
import { taskLabel } from './taskLabel'

describe('taskLabel', () => {
  it('names a task by key and title, and says when it is archived', () => {
    expect(taskLabel({ key: 'NEX-101', title: 'Rate limit' })).toBe('NEX-101 · Rate limit')
    expect(taskLabel({ key: 'NEX-101', title: 'Rate limit', archivedAt: '2026-10-28T00:00:00Z' })).toBe('NEX-101 · Rate limit (archived)')
    expect(taskLabel(undefined)).toBe('—')
  })
})
