import { describe, expect, it } from 'vitest'
import type { StatusCategory, TaskListEntry } from '@/api/types'
import { listCounts, orderTaskList } from './taskList'

const entry = (key: string, addedAt: string, dueAt: string | null, category: StatusCategory = 'todo'): TaskListEntry => ({
  id: `ct-${key}`, addedBy: 'u-1', addedAt,
  task: { id: key, key, title: key, status: 'todo', statusLabel: 'To do', category, projectKey: 'NEX', projectName: 'Nexus Core', assigneeId: null, projectId: 'p-nex', dueAt, overdue: false },
})

describe('a task list’s order (task list §2 Q5)', () => {
  const list = [
    entry('A', '2026-11-01T10:00:00.000Z', null),
    entry('B', '2026-11-01T11:00:00.000Z', '2026-11-20T00:00:00.000Z'),
    entry('C', '2026-11-01T12:00:00.000Z', '2026-11-02T00:00:00.000Z', 'done'),
    entry('D', '2026-11-01T09:00:00.000Z', '2026-11-20T00:00:00.000Z'),
    entry('E', '2026-11-01T08:00:00.000Z', '2026-11-05T00:00:00.000Z', 'inProgress'),
    entry('F', '2026-11-01T07:00:00.000Z', null, 'done'),
    entry('G', '2026-11-01T06:00:00.000Z', null),
  ]

  it('open tasks by due date, soonest first and no date last, ties by when added; done ones after, as added', () => {
    const { open, done } = orderTaskList(list)
    expect(open.map((e) => e.task.key)).toEqual(['E', 'D', 'B', 'G', 'A'])
    expect(done.map((e) => e.task.key)).toEqual(['F', 'C'])
  })

  it('counts what’s open and what’s done', () => {
    expect(listCounts(list)).toEqual({ open: 5, done: 2 })
    expect(listCounts([])).toEqual({ open: 0, done: 0 })
  })
})
