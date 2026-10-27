import { describe, expect, it } from 'vitest'
import type { TaskView } from '@/api/types'
import { boardDrop, boardMove, prunePending, withPending } from './boardMove'

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

describe('pending moves', () => {
  const a = { ...t('A', 'todo', 1000), updatedAt: 'u1' } as TaskView
  const b = { ...t('B', 'todo', 2000), updatedAt: 'u1' } as TaskView

  it('two quick moves both show', () => {
    const pending = { A: { patch: { status: 'done' as const, rank: 1000 }, updatedAt: 'u1' }, B: { patch: { rank: 500 }, updatedAt: 'u1' } }
    expect(withPending([a, b], pending).map((x) => [x.key, x.status, x.rank])).toEqual([['A', 'done', 1000], ['B', 'todo', 500]])
  })
  it("a move is dropped once the server's copy of that card changes, whoever changed it", () => {
    const pending = { A: { patch: { rank: 3000 }, updatedAt: 'u1' }, B: { patch: { rank: 500 }, updatedAt: 'u1' } }
    const later = [{ ...a, updatedAt: 'u2', rank: 1234 }, b]
    expect(Object.keys(prunePending(pending, later))).toEqual(['B'])
  })
  it('a card that is gone drops its move', () => {
    expect(prunePending({ A: { patch: { rank: 1 }, updatedAt: 'u1' } }, [b])).toEqual({})
  })
})

describe('boardDrop', () => {
  it('a drop into a vanishing gap renumbers the column in the order shown', () => {
    const col = [t('A', 'todo', 1000), t('B', 'todo', 1000 + 1e-7)]
    const moved = t('X', 'done', 500)
    const drop = boardDrop(moved, 'todo', col, col, 1)!
    expect(drop.patch).toEqual({ status: 'todo', rank: 2000 })
    expect(drop.renumber).toEqual([{ key: 'B', rank: 3000 }]) // A keeps 1000
  })
  it('a drop on a filtered board ranks against hidden cards too', () => {
    const full = [t('A', 'todo', 1000), t('H', 'todo', 1500), t('B', 'todo', 2000)] // H is filtered out
    const shown = [full[0]!, full[2]!]
    const drop = boardDrop(t('X', 'done', 1), 'todo', shown, full, 1)!
    // Dropped right before B: after H, never tied with it.
    expect(drop.patch.rank).toBeGreaterThan(1500)
    expect(drop.patch.rank).toBeLessThan(2000)
    expect(drop.renumber).toEqual([])
  })
})

describe('boardDrop with saving drops', () => {
  it('matches cards by key: a shown card that is a copy (a drop still saving) still places the next drop right', () => {
    const full = [t('A', 'done', 1000), t('B', 'done', 2000)]
    const shown = full.map((c) => ({ ...c })) // withPending makes copies
    const drop = boardDrop(t('X', 'todo', 1), 'done', shown, full, 2)! // at the end of Done
    expect(drop.patch.rank).toBe(3000)
  })
})

