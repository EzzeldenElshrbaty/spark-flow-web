import { describe, expect, it } from 'vitest'
import type { TaskView, User } from '@/api/types'
import { assigneeOptions, changedFields, savePatch, tasksLeftWith } from './taskForm'

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

const person = (id: string, name: string) => ({ id, name }) as User
const nour = person('u-2', 'Nour El-Sayed')
const mariam = person('u-3', 'Mariam Fathy')
const tarek = person('u-8', 'Tarek Lotfy')
const salma = person('u-5', 'Salma Ibrahim')
const hossam = person('u-6', 'Hossam Gaber')
const users = [nour, mariam, tarek, salma, hossam]

describe('changedFields and dates', () => {
  it('a due date the form only rewrote (same day, midnight) is not a change', () => {
    const seeded = { ...task, dueAt: '2026-11-01T14:30:00.000Z' } as TaskView
    expect(changedFields(seeded, { ...same, dueAt: '2026-11-01T00:00:00.000Z' })).toEqual({})
    expect(changedFields(seeded, { ...same, dueAt: '2026-11-02T00:00:00.000Z' })).toEqual({ dueAt: '2026-11-02T00:00:00.000Z' })
  })
})

describe('savePatch', () => {
  it("the assignee's save sends the status only when they changed it", () => {
    expect(savePatch(task, same, false)).toEqual({})
    expect(savePatch(task, { ...same, status: 'inReview', title: 'Ignored' }, false)).toEqual({ status: 'inReview' })
    expect(savePatch(task, { ...same, title: 'New' }, true)).toEqual({ title: 'New' })
  })
})

describe('assigneeOptions', () => {
  it('the current assignee stays an option when they left the project', () => {
    expect(assigneeOptions([nour, tarek], users, 'u-3')).toEqual([
      { id: 'u-3', label: 'Mariam Fathy (not on this project)' },
      { id: 'u-2', label: 'Nour El-Sayed' },
      { id: 'u-8', label: 'Tarek Lotfy' },
    ])
    expect(assigneeOptions([nour, mariam], users, 'u-3')).toEqual([
      { id: 'u-2', label: 'Nour El-Sayed' },
      { id: 'u-3', label: 'Mariam Fathy' },
    ])
    expect(assigneeOptions([nour], users, 'u-gone')[0]).toEqual({ id: 'u-gone', label: 'Unknown person (not on this project)' })
    expect(assigneeOptions([nour], users, null)).toEqual([{ id: 'u-2', label: 'Nour El-Sayed' }])
  })
})

describe('tasksLeftWith', () => {
  const board = { board: undefined }
  const t = (assigneeId: string, status = 'todo') => ({ assigneeId, status }) as TaskView
  it('warns who keeps open tasks when people are removed', () => {
    expect(tasksLeftWith(['u-2'], [t('u-2'), t('u-2', 'done')], board, users)).toBe('Nour El-Sayed keeps 1 open task here. Reassign it from the board.')
    expect(tasksLeftWith(['u-2', 'u-8'], [t('u-2'), t('u-8'), t('u-8', 'inProgress'), t('u-3')], board, users)).toBe(
      'Nour El-Sayed and Tarek Lotfy keep 3 open tasks here. Reassign them from the board.',
    )
    expect(tasksLeftWith(['u-2', 'u-8', 'u-5', 'u-6'], [t('u-2'), t('u-8'), t('u-5'), t('u-6'), t('u-6')], board, users)).toBe(
      'Nour El-Sayed, Tarek Lotfy and 2 others keep 5 open tasks here. Reassign them from the board.',
    )
  })
  it('three people: "and 1 other"', () => {
    expect(tasksLeftWith(['u-2', 'u-8', 'u-5'], [t('u-2'), t('u-8'), t('u-5')], board, users)).toBe(
      'Nour El-Sayed, Tarek Lotfy and 1 other keep 3 open tasks here. Reassign them from the board.',
    )
  })
  it('nobody removed, or no open tasks, means no warning', () => {
    expect(tasksLeftWith([], [t('u-2')], board, users)).toBeNull()
    expect(tasksLeftWith(['u-2'], [t('u-2', 'done'), t('u-3')], board, users)).toBeNull()
  })
})

