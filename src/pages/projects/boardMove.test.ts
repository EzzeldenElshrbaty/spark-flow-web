import { describe, expect, it } from 'vitest'
import type { TaskView } from '@/api/types'
import { boardMove } from './boardMove'

const t = (key: string, status: TaskView['status'], rank: number): TaskView => ({ id: key, key, status, rank }) as TaskView

describe('boardMove', () => {
  const todo = [t('A', 'todo', 1000), t('B', 'todo', 2000), t('C', 'todo', 3000)]
  const done = [t('D', 'done', 1000), t('E', 'done', 3000)]

  it('same place is no move', () => {
    expect(boardMove(todo[1]!, 'todo', todo, 1)).toBeNull()
  })
  it('down one inside a column goes between its new neighbours', () => {
    // Without A the column is [B, C]; place 1 is between B and C.
    expect(boardMove(todo[0]!, 'todo', todo, 1)).toEqual({ rank: 2500 })
  })
  it('to the top of another column', () => {
    expect(boardMove(todo[0]!, 'done', done, 0)).toEqual({ status: 'done', rank: 0 })
  })
  it('between two cards of another column', () => {
    expect(boardMove(todo[0]!, 'done', done, 1)).toEqual({ status: 'done', rank: 2000 })
  })
  it('to the end of another column', () => {
    expect(boardMove(todo[0]!, 'done', done, 2)).toEqual({ status: 'done', rank: 4000 })
  })
  it('empty column', () => {
    expect(boardMove(todo[0]!, 'inReview', [], 0)).toEqual({ status: 'inReview', rank: 1000 })
  })
})
