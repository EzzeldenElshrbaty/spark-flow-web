// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable, type Column } from './DataTable'

afterEach(cleanup)

type Row = { id: string; name: string }
const columns: Column<Row>[] = [
  { id: 'name', header: 'Name', width: 200, cell: (r) => <button type="button">Open {r.name}</button> },
  { id: 'note', header: 'Note', width: 200, cell: (r) => <span>About {r.name}</span> },
]

describe('DataTable row clicks (UX Phase 5A, 5.6)', () => {
  it('a click on a control inside a row is that control’s; a click on plain text opens the row', () => {
    const onRowClick = vi.fn()
    render(<DataTable columns={columns} rows={[{ id: 'a', name: 'Atlas' }]} rowKey={(r) => r.id} onRowClick={onRowClick} storageKey="test.table" label="Things" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Atlas' }))
    expect(onRowClick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('About Atlas'))
    expect(onRowClick).toHaveBeenCalledTimes(1)
  })
})
