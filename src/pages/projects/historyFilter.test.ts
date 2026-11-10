import { describe, expect, it } from 'vitest'
import type { ActivityEntry, ActivityKind } from '@/api/types'
import { dayGroups, emptyNote, historyFilter } from './historyFilter'

const e = (kind: ActivityKind): ActivityEntry => ({ id: kind, projectId: 'p', taskKey: null, actorId: 'u', at: '', kind, changes: [] })
const all = (['task.created', 'task.moved', 'comment.added', 'column.added', 'phase.changed', 'deliverable.added', 'project.changed'] as ActivityKind[]).map(e)

describe('historyFilter', () => {
  it('all keeps everything; tasks, board and comments narrow it', () => {
    expect(historyFilter(all, 'all')).toHaveLength(7)
    expect(historyFilter(all, 'tasks').map((x) => x.kind)).toEqual(['task.created', 'task.moved'])
    expect(historyFilter(all, 'board').map((x) => x.kind)).toEqual(['column.added', 'phase.changed', 'deliverable.added', 'project.changed'])
    expect(historyFilter(all, 'comments').map((x) => x.kind)).toEqual(['comment.added'])
  })
})

describe('emptyNote', () => {
  it('with older pages left, a chip says to load more; the feed never claims nothing happened while it is unread', () => {
    expect(emptyNote('comments', true)).toBe('Nothing like this in what is loaded. Load older to see more.')
    expect(emptyNote('all', true)).toBe('Nothing like this in what is loaded. Load older to see more.')
    expect(emptyNote('comments', false)).toBe('Nothing like this here yet.')
    expect(emptyNote('all', false)).toBe('Nothing has happened here yet.')
  })
})

describe('history by person and by day (UX Phase 4, 4.10)', () => {
  it('who keeps one person’s entries', () => {
    const mine = { ...e('task.created'), id: 'a', actorId: 'u-2' }
    const theirs = { ...e('task.moved'), id: 'b', actorId: 'u-3' }
    expect(historyFilter([mine, theirs], 'all', 'u-3').map((x) => x.id)).toEqual(['b'])
    expect(historyFilter([mine, theirs], 'all', '')).toHaveLength(2)
  })
  it('groups newest first under Today, Yesterday and the day', () => {
    const at = (id: string, when: Date) => ({ ...e('task.created'), id, at: when.toISOString() })
    const now = new Date(2026, 10, 9, 15)
    const groups = dayGroups([at('a', new Date(2026, 10, 9, 10)), at('b', new Date(2026, 10, 9, 9)), at('c', new Date(2026, 10, 8, 18)), at('d', new Date(2026, 10, 4, 12))], now)
    expect(groups.map((g) => [g.label, g.entries.map((x) => x.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['Wednesday 4 November', ['d']],
    ])
  })
})

describe('the empty note names the person filter (UX Phase 6, deferred minor #14)', () => {
  it('with a person chosen it says nothing by them', () => {
    expect(emptyNote('all', false, 'Mariam Fathy')).toBe('Nothing by Mariam Fathy here yet.')
    expect(emptyNote('tasks', true, 'Mariam Fathy')).toBe('Nothing by Mariam Fathy in what is loaded. Load older to see more.')
    expect(emptyNote('all', false)).toBe('Nothing has happened here yet.')
  })
})

