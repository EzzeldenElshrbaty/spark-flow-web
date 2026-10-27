import { describe, expect, it } from 'vitest'
import type { BoardColumn } from '@/api/types'
import { boardColumns, columnErrors, columnLabel, moveColumn } from './boardColumns'

const standard: BoardColumn[] = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'todo', label: 'To do' },
  { status: 'inProgress', label: 'In progress' },
  { status: 'inReview', label: 'In review' },
  { status: 'done', label: 'Done' },
]

describe('boardColumns', () => {
  it('no board gives the standard five', () => {
    expect(boardColumns({})).toEqual(standard)
  })
  it('keeps the project order and labels', () => {
    const board: BoardColumn[] = [standard[1]!, standard[0]!, standard[2]!, { status: 'inReview', label: 'Testing' }, standard[4]!]
    expect(boardColumns({ board })).toEqual(board)
    expect(columnLabel({ board }, 'inReview')).toBe('Testing')
    expect(columnLabel({}, 'inReview')).toBe('In review')
  })
  it('a missing status is added at the end with its standard name; a blank label falls back', () => {
    const cols = boardColumns({ board: [{ status: 'done', label: '  ' }, { status: 'todo', label: 'Next' }] })
    expect(cols.map((c) => c.status)).toEqual(['done', 'todo', 'backlog', 'inProgress', 'inReview'])
    expect(cols[0]!.label).toBe('Done')
    expect(cols[1]!.label).toBe('Next')
  })
})

describe('moveColumn', () => {
  it('moves a column to an index', () => {
    expect(moveColumn(standard, 'inReview', 4).map((c) => c.status)).toEqual(['backlog', 'todo', 'inProgress', 'done', 'inReview'])
    expect(moveColumn(standard, 'done', 0).map((c) => c.status)).toEqual(['done', 'backlog', 'todo', 'inProgress', 'inReview'])
  })
})

describe('columnErrors', () => {
  const with_ = (i: number, label: string) => standard.map((c, j) => (j === i ? { ...c, label } : c))
  it('good columns have none', () => {
    expect(columnErrors(standard)).toBeNull()
  })
  it('each rule, in order', () => {
    expect(columnErrors(with_(0, ' '))).toBe('Name each column.')
    expect(columnErrors(with_(0, 'x'.repeat(31)))).toBe('Keep column names under 30 characters.')
    expect(columnErrors(with_(0, 'done'))).toBe("Two columns can't share a name.")
    expect(columnErrors(standard.slice(0, 4))).toBe('Every status needs one column.')
    expect(columnErrors([...standard.slice(0, 4), { status: 'todo', label: 'Again' }])).toBe('Every status needs one column.')
  })
})
