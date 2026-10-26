import { describe, expect, it } from 'vitest'
import type { Phase, TaskView } from '@/api/types'
import { moveDown, moveUp, stagesOf } from './phases'

const now = new Date('2026-10-26T12:00:00Z')
const phase = (over: Partial<Phase>): Phase => ({
  id: 'ph', projectId: 'p', name: 'Build', order: 1, startDate: '2026-09-01T00:00:00Z', dueDate: '2026-10-03T00:00:00Z', status: 'inProgress', ...over,
})
const task = (phaseId: string | null) => ({ id: Math.random().toString(), phaseId }) as unknown as TaskView

describe('stagesOf', () => {
  it('orders phases and says "Due <day>" or "Done", with task counts and overdue', () => {
    const phases = [
      phase({ id: 'b', name: 'Build', order: 2, dueDate: '2026-11-20T00:00:00Z', status: 'notStarted' }),
      phase({ id: 'a', name: 'Analysis', order: 1, status: 'done' }),
      phase({ id: 'c', name: 'Test', order: 3, dueDate: '2026-10-03T00:00:00Z' }),
    ]
    const stages = stagesOf(phases, [task('b'), task('b'), task('c'), task(null)], now)
    expect(stages.map((s) => [s.id, s.label, s.meta])).toEqual([
      ['a', 'Analysis', 'Done'],
      ['b', 'Build', 'Due 20 Nov'],
      ['c', 'Test', 'Due 3 Oct'],
    ])
    expect(stages.map((s) => s.taskCount)).toEqual([0, 2, 1])
    expect(stages.map((s) => s.overdue)).toEqual([false, false, true])
  })
})

describe('moveUp / moveDown', () => {
  const ids = ['a', 'b', 'c']
  it('swaps with the neighbour, and stays put at the ends', () => {
    expect(moveUp(ids, 'b')).toEqual(['b', 'a', 'c'])
    expect(moveDown(ids, 'b')).toEqual(['a', 'c', 'b'])
    expect(moveUp(ids, 'a')).toEqual(ids)
    expect(moveDown(ids, 'c')).toEqual(ids)
    expect(moveUp(ids, 'zz')).toEqual(ids)
  })
})
