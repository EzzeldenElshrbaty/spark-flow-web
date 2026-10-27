import { describe, expect, it } from 'vitest'
import type { BoardColumn } from '@/api/types'
import { categoryOf, columnErrors, columnLabel, columnsOf, defaultMoveTo, firstOf, moveColumn } from './boardColumns'
import { DEFAULT_COLUMNS, statusLabel } from './statuses'

const custom: BoardColumn[] = [
  { id: 'todo', label: 'Next', category: 'todo' },
  { id: 'col-1', label: 'Building', category: 'inProgress' },
  { id: 'col-2', label: 'Shipped', category: 'done' },
]

describe('columnsOf', () => {
  it('no board gives the standard five, typed', () => {
    expect(columnsOf({})).toEqual(DEFAULT_COLUMNS)
    expect(DEFAULT_COLUMNS.map((c) => [c.id, c.category])).toEqual([
      ['backlog', 'todo'],
      ['todo', 'todo'],
      ['inProgress', 'inProgress'],
      ['inReview', 'inProgress'],
      ['done', 'done'],
    ])
  })
  it("keeps the project's own columns", () => {
    expect(columnsOf({ board: custom })).toEqual(custom)
  })
})

describe('categoryOf, columnLabel, firstOf', () => {
  it('maps the defaults and custom columns; an unknown id reads as to do and —', () => {
    expect(categoryOf({}, 'inReview')).toBe('inProgress')
    expect(categoryOf({ board: custom }, 'col-2')).toBe('done')
    expect(categoryOf({ board: custom }, 'gone')).toBe('todo')
    expect(columnLabel({ board: custom }, 'col-1')).toBe('Building')
    expect(columnLabel({ board: custom }, 'gone')).toBe('—')
    expect(firstOf({ board: custom }, 'todo').id).toBe('todo')
    expect(firstOf({}, 'done').id).toBe('done')
  })
})

describe('moveColumn', () => {
  it('moves a column to an index', () => {
    expect(moveColumn(custom, 'col-2', 0).map((c) => c.id)).toEqual(['col-2', 'todo', 'col-1'])
  })
})

describe('columnErrors', () => {
  const with_ = (i: number, over: Partial<BoardColumn>) => custom.map((c, j) => (j === i ? { ...c, ...over } : c))
  it('good columns have none', () => {
    expect(columnErrors(custom)).toBeNull()
  })
  it('each rule, in order', () => {
    expect(columnErrors(with_(0, { label: ' ' }))).toBe('Name each column.')
    expect(columnErrors(with_(0, { label: 'x'.repeat(31) }))).toBe('Keep column names under 30 characters.')
    expect(columnErrors(with_(0, { label: 'shipped' }))).toBe("Two columns can't share a name.")
    expect(columnErrors(with_(2, { category: 'inProgress' }))).toBe('Each type needs at least one column.')
    const many = Array.from({ length: 11 }, (_, i): BoardColumn => ({ id: `c${i}`, label: `C${i}`, category: i === 0 ? 'todo' : i === 1 ? 'done' : 'inProgress' }))
    expect(columnErrors(many)).toBe('A board can have up to 10 columns.')
  })
})

describe('defaultMoveTo', () => {
  it('the first other column of the same type, else the first other', () => {
    const cols: BoardColumn[] = [
      { id: 'a', label: 'A', category: 'todo' },
      { id: 'b', label: 'B', category: 'inProgress' },
      { id: 'c', label: 'C', category: 'inProgress' },
      { id: 'd', label: 'D', category: 'done' },
    ]
    expect(defaultMoveTo(cols, 'c')).toBe('b')
    expect(defaultMoveTo(cols, 'b')).toBe('c')
    expect(defaultMoveTo(cols, 'a')).toBe('b')
  })
})

describe('statusLabel without a project', () => {
  it('names the five defaults and never shows a raw column id', () => {
    expect(statusLabel('inReview')).toBe('In review')
    expect(statusLabel('col-3f2a')).toBe('—')
  })
})
