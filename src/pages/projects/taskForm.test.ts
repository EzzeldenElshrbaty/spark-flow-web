import { describe, expect, it } from 'vitest'
import type { TaskView } from '@/api/types'
import { changedFields } from './taskForm'

const task = {
  title: 'Login', description: '', type: 'task', phaseId: 'ph1', status: 'todo', priority: 'medium', assigneeId: 'u-8',
  dueAt: null, estimateHours: 4, sprintId: null,
} as unknown as TaskView
const same = {
  title: 'Login', description: '', type: 'task' as const, phaseId: 'ph1', status: 'todo', priority: 'medium' as const, assigneeId: 'u-8',
  dueAt: null, estimateHours: 4, sprintId: null,
}

describe('changedFields', () => {
  it('only the fields that changed', () => {
    expect(changedFields(task, { ...same, dueAt: '2026-11-01T00:00:00.000Z' })).toEqual({ dueAt: '2026-11-01T00:00:00.000Z' })
    expect(changedFields(task, same)).toEqual({})
    // The assignee (here someone off the project) isn't sent back when left alone.
    expect(changedFields(task, { ...same, status: 'inReview' })).toEqual({ status: 'inReview' })
  })
})
