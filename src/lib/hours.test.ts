import { describe, expect, it } from 'vitest'
import type { MyTimer } from '@/api/types'
import { runningClock, timerForTask } from './hours'

describe('runningClock', () => {
  const start = '2026-10-26T08:00:00.000Z'
  it('counts up to now', () => {
    expect(runningClock(start, new Date('2026-10-26T09:30:00.000Z'))).toEqual({ ms: 90 * 60_000, capped: false })
  })
  it('the running clock stops at 12 h and says so', () => {
    expect(runningClock(start, new Date('2026-10-26T21:00:00.000Z'))).toEqual({ ms: 12 * 3_600_000, capped: true })
  })
})

describe('timerForTask (timer slice 1)', () => {
  const timer = (over: Partial<MyTimer> = {}): MyTimer => ({ state: 'running', target: { taskId: 't-1' }, projectId: 'p-1', entryId: 'te-1', runMs: 0, startedAt: '2026-11-05T09:00:00.000Z', pausedBy: null, ...over })
  it("is my timer when it runs or is paused on that task, else null", () => {
    expect(timerForTask(timer(), 't-1')?.entryId).toBe('te-1')
    expect(timerForTask(timer({ state: 'paused', startedAt: null, pausedBy: 'me' }), 't-1')?.state).toBe('paused')
    expect(timerForTask(timer(), 't-2')).toBeNull()
    expect(timerForTask(timer({ target: { projectId: 'p-1' } }), 't-1')).toBeNull()
    expect(timerForTask(null, 't-1')).toBeNull()
  })
})
