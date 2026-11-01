import { describe, expect, it } from 'vitest'
import type { ActivityEntry, ActivityKind } from '@/api/types'
import { emptyNote, historyFilter } from './historyFilter'

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
