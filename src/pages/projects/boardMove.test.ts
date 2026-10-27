import { describe, expect, it } from 'vitest'
import type { TaskView } from '@/api/types'
import { boardMove } from './boardMove'

const t = (over: Partial<TaskView>): TaskView => ({ id: 'x', key: 'P-1', status: 'todo', rank: 1000, ...over }) as TaskView

describe('boardMove', () => {
  it('same column is no move', () => {
    expect(boardMove(t({ status: 'todo' }), 'todo', [t({ rank: 1000 })])).toBeNull()
  })
  it('goes to the end of the target column', () => {
    expect(boardMove(t({}), 'done', [t({ rank: 1000, status: 'done' }), t({ rank: 3000, status: 'done' })])).toEqual({ status: 'done', rank: 4000 })
  })
  it('empty column', () => {
    expect(boardMove(t({}), 'inReview', [])).toEqual({ status: 'inReview', rank: 1000 })
  })
})
