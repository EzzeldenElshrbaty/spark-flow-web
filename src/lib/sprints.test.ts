import { describe, expect, it } from 'vitest'
import type { Sprint, TaskView } from '@/api/types'
import { defaultSprintDates, nextSprintName, sortSprints, sprintDays, sprintErrors, sprintTotals } from './sprints'

// Days are local (the unit project runs in Africa/Cairo), so every date here is built from local parts.
const startOf = (y: number, m: number, d: number) => new Date(y, m - 1, d, 0, 0, 0, 0)
const endOf = (y: number, m: number, d: number) => new Date(y, m - 1, d, 23, 59, 59, 999)

describe('nextSprintName', () => {
  it('is the highest number among the names, plus one', () => {
    expect(nextSprintName(['Sprint 14', 'Sprint 15'])).toBe('Sprint 16')
    expect(nextSprintName(['Sprint 15', 'Sprint 14'])).toBe('Sprint 16')
    expect(nextSprintName(['Sprint 9', 'Sprint 10'])).toBe('Sprint 11')
  })
  it('reads the number out of a name that carries more', () => {
    expect(nextSprintName(['Sprint 9', 'Hotfix', 'Sprint 12b'])).toBe('Sprint 13')
    expect(nextSprintName(['Q4 Sprint 3'])).toBe('Sprint 4')
  })
  it('starts at Sprint 1 when no name has a number', () => {
    expect(nextSprintName([])).toBe('Sprint 1')
    expect(nextSprintName(['Hotfix'])).toBe('Sprint 1')
  })
})

describe('defaultSprintDates', () => {
  const now = new Date(2026, 10, 11, 14, 30)
  const ending = (end: Date) => ({ endDate: end.toISOString() })

  it('starts the day after the latest end and runs 14 days inclusive', () => {
    const got = defaultSprintDates([ending(endOf(2026, 11, 20))], now)
    expect(got.startDate).toBe(startOf(2026, 11, 21).toISOString())
    expect(got.endDate).toBe(endOf(2026, 12, 4).toISOString())
  })
  it('goes by the latest end, whatever the order', () => {
    const got = defaultSprintDates([ending(endOf(2026, 11, 20)), ending(endOf(2026, 11, 6)), ending(endOf(2026, 11, 13))], now)
    expect(got.startDate).toBe(startOf(2026, 11, 21).toISOString())
  })
  it('starts today when the latest end is past', () => {
    const got = defaultSprintDates([ending(endOf(2026, 11, 8))], now)
    expect(got.startDate).toBe(startOf(2026, 11, 11).toISOString())
    expect(got.endDate).toBe(endOf(2026, 11, 24).toISOString())
  })
  it('starts today when the latest sprint ends yesterday', () => {
    expect(defaultSprintDates([ending(endOf(2026, 11, 10))], now).startDate).toBe(startOf(2026, 11, 11).toISOString())
  })
  it('starts tomorrow when the latest sprint ends today', () => {
    expect(defaultSprintDates([ending(endOf(2026, 11, 11))], now).startDate).toBe(startOf(2026, 11, 12).toISOString())
  })
  it('starts today when there is no sprint', () => {
    const got = defaultSprintDates([], now)
    expect(got.startDate).toBe(startOf(2026, 11, 11).toISOString())
    expect(got.endDate).toBe(endOf(2026, 11, 24).toISOString())
  })
  it('keeps 14 whole local days across a clock change', () => {
    const got = defaultSprintDates([], new Date(2026, 9, 25, 9, 0))
    expect(got.startDate).toBe(startOf(2026, 10, 25).toISOString())
    expect(got.endDate).toBe(endOf(2026, 11, 7).toISOString())
  })
})

describe('sprintErrors', () => {
  const S = startOf(2026, 11, 21).toISOString()
  const E = endOf(2026, 12, 4).toISOString()
  const form = (over: Partial<{ name: string; goal: string; startDate: string; endDate: string }> = {}) =>
    ({ name: 'Sprint 15', goal: '', startDate: S, endDate: E, ...over })

  it('has nothing to say about a good form', () => {
    expect(sprintErrors(form())).toEqual({})
    expect(sprintErrors(form({ name: 'x'.repeat(60), goal: 'y'.repeat(500) }))).toEqual({})
  })
  it('wants a name of up to 60 characters', () => {
    expect(sprintErrors(form({ name: ' ' })).name).toBe('Give the sprint a name.')
    expect(sprintErrors(form({ name: '' })).name).toBe('Give the sprint a name.')
    expect(sprintErrors(form({ name: 'x'.repeat(61) })).name).toBe('Keep the name under 60 characters.')
  })
  it('keeps the goal to 500 characters', () => {
    expect(sprintErrors(form({ goal: 'x'.repeat(501) })).goal).toBe('Keep the goal under 500 characters.')
  })
  it('wants the end after the start', () => {
    expect(sprintErrors(form({ startDate: E, endDate: S })).endDate).toBe('The end date must be after the start date.')
    expect(sprintErrors(form({ startDate: S, endDate: S })).endDate).toBe('The end date must be after the start date.')
    expect(sprintErrors(form({ endDate: 'not a date' })).endDate).toBe('The end date must be after the start date.')
  })
  it('reports each field it finds, and only those', () => {
    expect(sprintErrors(form({ name: '', goal: 'x'.repeat(501), startDate: E, endDate: S }))).toEqual({
      name: 'Give the sprint a name.',
      goal: 'Keep the goal under 500 characters.',
      endDate: 'The end date must be after the start date.',
    })
  })
})

describe('sortSprints', () => {
  const sprint = (id: string, state: Sprint['state'], start: Date, end: Date): Sprint =>
    ({ id, projectId: 'p-nex', name: id, goal: '', startDate: start.toISOString(), endDate: end.toISOString(), state })
  const closedOld = sprint('closedOld', 'closed', startOf(2026, 9, 1), endOf(2026, 9, 14))
  const closedNew = sprint('closedNew', 'closed', startOf(2026, 10, 1), endOf(2026, 10, 14))
  const active = sprint('active', 'active', startOf(2026, 11, 3), endOf(2026, 11, 16))
  const planned1 = sprint('planned1', 'planned', startOf(2026, 11, 17), endOf(2026, 11, 30))
  const planned2 = sprint('planned2', 'planned', startOf(2026, 12, 1), endOf(2026, 12, 14))

  it('puts the active sprint first, then planned by start, then closed newest first', () => {
    expect(sortSprints([closedOld, planned2, active, planned1, closedNew]).map((s) => s.id)).toEqual(['active', 'planned1', 'planned2', 'closedNew', 'closedOld'])
  })
  it('leaves the list it was given as it was', () => {
    const list = [closedOld, planned2, active]
    sortSprints(list)
    expect(list.map((s) => s.id)).toEqual(['closedOld', 'planned2', 'active'])
  })
})

describe('sprintDays', () => {
  const now = new Date(2026, 10, 11, 14, 30)
  const days = (n: number) => ({ startDate: startOf(2026, 11, 1).toISOString(), endDate: endOf(2026, 11, 11 + n).toISOString() })

  it('counts the days left', () => {
    expect(sprintDays(days(4), now)).toBe('4 days left')
    expect(sprintDays(days(2), now)).toBe('2 days left')
  })
  it('says 1 day left, not 1 days', () => {
    expect(sprintDays(days(1), now)).toBe('1 day left')
  })
  it('says Ends today on the last day, even late in it', () => {
    expect(sprintDays(days(0), now)).toBe('Ends today')
    expect(sprintDays(days(0), new Date(2026, 10, 11, 23, 59))).toBe('Ends today')
    expect(sprintDays(days(0), new Date(2026, 10, 11, 0, 0))).toBe('Ends today')
  })
  it('counts the days since it ended', () => {
    expect(sprintDays(days(-1), now)).toBe('Ended 1 day ago')
    expect(sprintDays(days(-2), now)).toBe('Ended 2 days ago')
  })
  it('counts local days across a clock change', () => {
    expect(sprintDays({ startDate: '', endDate: endOf(2026, 11, 2).toISOString() }, new Date(2026, 9, 28, 12, 0))).toBe('5 days left')
  })
})

describe('sprintTotals', () => {
  const task = (over: Partial<TaskView>) => ({ id: 't', sprintId: 's1', storyPoints: null, category: 'todo', archivedAt: null, ...over }) as TaskView
  it('counts the sprint’s own tasks, points and done work', () => {
    const tasks = [
      task({ id: 't-1', storyPoints: 3, category: 'done' }),
      task({ id: 't-2', storyPoints: 5 }),
      task({ id: 't-3', storyPoints: null, category: 'inProgress' }),
      task({ id: 't-4', storyPoints: 8, archivedAt: '2026-11-05T10:00:00.000Z' }),
      task({ id: 't-5', storyPoints: 13, sprintId: 's2' }),
      task({ id: 't-6', storyPoints: 2, sprintId: null }),
    ]
    expect(sprintTotals(tasks, 's1')).toEqual({ tasks: 3, points: 8, done: 1, donePoints: 3 })
  })
  it('leaves an archived done task out of the done count too', () => {
    expect(sprintTotals([task({ storyPoints: 5, category: 'done', archivedAt: '2026-11-05T10:00:00.000Z' })], 's1')).toEqual({ tasks: 0, points: 0, done: 0, donePoints: 0 })
  })
  it('is all zeros for a sprint with no tasks', () => {
    expect(sprintTotals([], 's1')).toEqual({ tasks: 0, points: 0, done: 0, donePoints: 0 })
  })
})
