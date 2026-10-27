import { describe, expect, it } from 'vitest'
import type { Ticket } from '@/api/types'
import { taskEventOf } from './taskEvents'

const t = (over: Partial<Ticket> = {}): Ticket => ({ key: 'NEX-1', title: 'Rate limit', status: 'todo', assigneeId: null, rank: 1000, ...over }) as Ticket

describe('taskEventOf', () => {
  it('create gives created', () => {
    expect(taskEventOf(null, t())).toEqual([{ key: 'NEX-1', kind: 'created' }])
  })
  it('assignee to a person gives assigned; to nobody gives nothing', () => {
    expect(taskEventOf(t(), t({ assigneeId: 'u-3' }))).toEqual([{ key: 'NEX-1', kind: 'assigned', assigneeId: 'u-3' }])
    expect(taskEventOf(t({ assigneeId: 'u-3' }), t({ assigneeId: null }))).toEqual([])
  })
  it('status change gives status, to done gives done', () => {
    expect(taskEventOf(t(), t({ status: 'inReview' }))).toEqual([{ key: 'NEX-1', kind: 'status', status: 'inReview', statusLabel: 'In review' }])
    expect(taskEventOf(t(), t({ status: 'done' }))).toEqual([{ key: 'NEX-1', kind: 'done', status: 'done', statusLabel: 'Done' }])
  })
  it('assigned comes before the status change', () => {
    expect(taskEventOf(t(), t({ assigneeId: 'u-3', status: 'inProgress' })).map((e) => e.kind)).toEqual(['assigned', 'status'])
  })
  it('rank or title only gives nothing', () => {
    expect(taskEventOf(t(), t({ rank: 5, title: 'Other' }))).toEqual([])
  })
  it('same status gives nothing', () => {
    expect(taskEventOf(t({ status: 'done' }), t({ status: 'done' }))).toEqual([])
  })
})

describe('done cards follow the type change', () => {
  it('moving between two Done-type columns posts a status card, not another Done', () => {
    const board = { board: [{ id: 'todo', label: 'To do', category: 'todo' as const }, { id: 'done', label: 'Done', category: 'done' as const }, { id: 'col-ship', label: 'Shipped', category: 'done' as const }] }
    expect(taskEventOf(t({ status: 'done' }), t({ status: 'col-ship' }), board).map((e) => e.kind)).toEqual(['status'])
    expect(taskEventOf(t({ status: 'todo' }), t({ status: 'col-ship' }), board).map((e) => e.kind)).toEqual(['done'])
  })
})
