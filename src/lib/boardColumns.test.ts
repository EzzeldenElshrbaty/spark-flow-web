import { describe, expect, it } from 'vitest'
import type { BoardColumn } from '@/api/types'
import { categoryOf, columnErrors, columnLabel, columnsOf, columnTaskCount, defaultMoveTo, doneChange, firstOf, hueKey, moveColumn, startColumn } from './boardColumns'
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
    expect(columnErrors(with_(0, { label: 'shipped' }))).toBe("Two columns can’t share a name.")
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

describe('startColumn', () => {
  it('a new task starts in To do when the board has it, else in the first To do-type column', () => {
    expect(startColumn({})).toBe('todo')
    expect(startColumn({ board: custom })).toBe('todo')
    expect(startColumn({ board: [{ id: 'col-next', label: 'Next', category: 'todo' }, ...custom.slice(1)] })).toBe('col-next')
  })
})

describe('hueKey and columnTaskCount', () => {
  it("a default column keeps its own hue only while its type is the default one's", () => {
    expect(hueKey('inReview', 'inProgress')).toBe('inReview')
    expect(hueKey('done', 'inProgress')).toBe('inProgress')
    expect(hueKey('col-1', 'done')).toBe('done')
    expect(hueKey('col-1', 'todo')).toBe('backlog')
  })
  it("counts a column's tasks among all of them, archived included", () => {
    const t = (status: string) => ({ status }) as { status: string }
    expect(columnTaskCount([t('a'), t('b'), t('a')], [t('a')], 'a')).toBe(3)
  })
})

describe('doneChange (UX Phase 4, 4.10)', () => {
  it('says when tasks start or stop counting as done, and nothing otherwise', () => {
    expect(doneChange('inProgress', 'done', 3)).toBe('3 tasks here will count as done.')
    expect(doneChange('done', 'todo', 1)).toBe('1 task here will stop counting as done.')
    expect(doneChange('todo', 'inProgress', 4)).toBeNull()
    expect(doneChange('done', 'done', 4)).toBeNull()
    expect(doneChange('inProgress', 'done', 0)).toBeNull()
  })
  it('names where they go when they move', () => {
    expect(doneChange('inProgress', 'done', 2, 'Shipped')).toBe('2 tasks moved to Shipped will count as done.')
  })
})
