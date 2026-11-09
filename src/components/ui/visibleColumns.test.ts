import { describe, expect, it } from 'vitest'
import { visibleColumns, type Column } from './DataTable'

const col = (id: string, width: number, dropOrder?: number): Column<unknown> => ({ id, header: id, width, dropOrder, cell: () => null })
const columns = [col('name', 200), col('client', 150, 1), col('manager', 150, 2), col('due', 100)]
const ids = (box: number, widths: Record<string, number> = {}) => visibleColumns(columns, widths, box).map((c) => c.id)

describe('visibleColumns (UX Phase 4, 4.1)', () => {
  it('keeps every column when the box’s width isn’t known', () => {
    expect(ids(0)).toEqual(['name', 'client', 'manager', 'due'])
  })

  it('leaves out the lowest drop order first, until the rest fit', () => {
    expect(ids(600)).toEqual(['name', 'client', 'manager', 'due'])
    expect(ids(599)).toEqual(['name', 'manager', 'due'])
    expect(ids(449)).toEqual(['name', 'due'])
  })

  it('never leaves out a column without a drop order, even if it then scrolls', () => {
    expect(ids(100)).toEqual(['name', 'due'])
  })

  it('reads the widths someone dragged', () => {
    expect(ids(600, { name: 300 })).toEqual(['name', 'manager', 'due'])
  })
})

describe('a column widened by hand (final review)', () => {
  it('never drops: the next one in drop order goes instead, so the column being dragged stays under the pointer', () => {
    expect(ids(599, { client: 150 })).toEqual(['name', 'client', 'due'])
  })
})
