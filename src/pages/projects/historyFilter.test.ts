import { describe, expect, it } from 'vitest'
import type { ActivityEntry, ActivityKind } from '@/api/types'
import { historyFilter } from './historyFilter'

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
