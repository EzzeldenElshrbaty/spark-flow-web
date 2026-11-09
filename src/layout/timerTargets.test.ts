import { describe, expect, it } from 'vitest'
import type { TaskView } from '@/api/types'
import { timerTargets } from './timerTargets'

// UX Phase 4, 4.3: Start timer's one list — my open tasks first, then recent ones; with words, matches.

const task = (key: string, over: Partial<TaskView> = {}) =>
  ({ id: `t-${key}`, key, title: `Task ${key}`, projectId: 'p-nex', assigneeId: 'u-1', category: 'todo', overdue: false, overEstimate: false, dueAt: null, ...over }) as TaskView
const projects = [
  { id: 'p-nex', name: 'Nexus Core' },
  { id: 'p-mob', name: 'Mobile App' },
]
const ids = (groups: ReturnType<typeof timerTargets>) => groups.map((g) => [g.label, g.targets.map((t) => t.id)])

describe('timerTargets', () => {
  it('with no words: My tasks needing attention first (up to 8), then Recent not already listed', () => {
    const tasks = [task('NEX-1'), task('NEX-2', { overdue: true }), task('NEX-3', { assigneeId: 'u-2' }), task('NEX-4', { category: 'done' })]
    const groups = timerTargets({ meId: 'u-1', tasks, projects, recent: ['task:t-NEX-3', 'task:t-NEX-1', 'project:p-mob', 'task:t-NEX-4', 'project:p-gone'], q: '' })
    expect(ids(groups)).toEqual([
      ['My tasks', ['t-NEX-2', 't-NEX-1']],
      ['Recent', ['t-NEX-3', 'p-mob']],
    ])
    expect(groups[0]!.targets[0]).toEqual({ kind: 'task', id: 't-NEX-2', projectId: 'p-nex', label: 'NEX-2 · Task NEX-2', detail: 'Nexus Core' })
    expect(groups[1]!.targets[1]).toEqual({ kind: 'project', id: 'p-mob', projectId: 'p-mob', label: 'Mobile App', detail: 'The project only' })
  })

  it('caps My tasks at 8 and Recent at 5', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => task(`NEX-${i + 1}`))
    const others = Array.from({ length: 8 }, (_, i) => task(`MOB-${i + 1}`, { assigneeId: 'u-2', projectId: 'p-mob' }))
    const groups = timerTargets({ meId: 'u-1', tasks: [...tasks, ...others], projects, recent: others.map((t) => `task:${t.id}`), q: '' })
    expect(groups.map((g) => g.targets.length)).toEqual([8, 5])
  })

  it('with words: open tasks whose key, title or project match, mine first, up to 20', () => {
    const tasks = [task('NEX-1', { title: 'Login page', assigneeId: 'u-2' }), task('NEX-2', { title: 'Logout' }), task('MOB-1', { projectId: 'p-mob', title: 'Push' }), task('NEX-3', { title: 'Log', category: 'done' })]
    expect(ids(timerTargets({ meId: 'u-1', tasks, projects, recent: [], q: 'log' }))).toEqual([['Matches', ['t-NEX-2', 't-NEX-1']]])
    expect(ids(timerTargets({ meId: 'u-1', tasks, projects, recent: [], q: 'mobile' }))).toEqual([['Matches', ['t-MOB-1']]])
    expect(timerTargets({ meId: 'u-1', tasks, projects, recent: [], q: 'zzz' })).toEqual([])
  })

  it('leaves out tasks on projects I can’t log on', () => {
    const tasks = [task('OPS-1', { projectId: 'p-ops' })]
    expect(timerTargets({ meId: 'u-1', tasks, projects, recent: [], q: '' })).toEqual([])
  })
})
