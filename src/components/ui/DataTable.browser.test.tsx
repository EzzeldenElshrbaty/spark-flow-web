import '@/index.css'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { DataTable, type Column } from './DataTable'

// UX Phase 4, 4.1: a table that doesn't fit leaves out its low-value columns first; if it still scrolls, the first
// column stays put and the end edge says there's more. Real layout, so Chromium.

type Row = { id: string; name: string }
const col = (id: string, header: string, width: number, dropOrder?: number): Column<Row> => ({ id, header, width, dropOrder, cell: (r) => `${r.name} ${id}` })
// The Projects table's columns, with Cost (an Admin's view): 1300 px in all.
const columns = [
  col('name', 'Project', 260),
  col('client', 'Client', 160, 1),
  col('manager', 'Manager', 160, 2),
  col('phase', 'Phase', 140, 3),
  col('due', 'Due', 120),
  col('progress', 'Progress', 150),
  col('hours', 'Hours', 90),
  col('cost', 'Cost', 120),
  col('overdue', 'Overdue', 100),
]
const rows = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}` }))

function mount(width: number, dir: 'ltr' | 'rtl' = 'ltr') {
  render(
    <div dir={dir} style={{ width }} data-testid="box">
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={() => {}} storageKey={`test-table-${width}-${dir}`} label="Projects" />
    </div>,
  )
}
const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent)
const scroller = () => screen.getByRole('table').parentElement as HTMLElement

beforeEach(async () => {
  localStorage.clear()
  await page.viewport(1440, 900)
})
afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
})

describe('DataTable fits its box (UX Phase 4)', () => {
  it('at a 1280 screen’s width (a 946 px box) it leaves out Client, Manager and Phase, and doesn’t scroll', async () => {
    mount(948)
    await expect.poll(() => headers()).toEqual(['Project', 'Due', 'Progress', 'Hours', 'Cost', 'Overdue'])
    expect(scroller().scrollWidth).toBeLessThanOrEqual(scroller().clientWidth)
    expect(screen.queryByRole('button', { name: 'Scroll to more columns' })).toBeNull()
  })

  it('with room, every column shows', async () => {
    mount(1310)
    await expect.poll(() => headers()).toHaveLength(9)
  })

  it('still too wide: the first column sticks, and the arrow at the end scrolls until there’s no more', async () => {
    mount(500)
    const more = await screen.findByRole('button', { name: 'Scroll to more columns' })
    expect(getComputedStyle(screen.getAllByRole('cell')[0]!).position).toBe('sticky')
    expect(getComputedStyle(screen.getAllByRole('columnheader')[0]!).position).toBe('sticky')
    fireEvent.click(more)
    await expect.poll(() => scroller().scrollLeft).toBeGreaterThan(0)
    scroller().scrollLeft = scroller().scrollWidth
    fireEvent.scroll(scroller())
    await expect.poll(() => screen.queryByRole('button', { name: 'Scroll to more columns' })).toBeNull()
  })

  it('right to left, the arrow sits on the left', async () => {
    mount(500, 'rtl')
    const more = await screen.findByRole('button', { name: 'Scroll to more columns' })
    const box = screen.getByTestId('box').getBoundingClientRect()
    expect(more.getBoundingClientRect().right).toBeLessThan(box.left + box.width / 2)
  })

  it('has no serious accessibility issue, light or dark', async () => {
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle('dark', dark)
      mount(500)
      await screen.findByRole('button', { name: 'Scroll to more columns' })
      const result = await axe.run(document)
      expect(result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
      cleanup()
    }
  })
})

describe('the table’s layers and its sort (UX Phase 6, deferred minors #13 and #21)', () => {
  it('a resize handle scrolled under the sticky first header doesn’t draw over it, nor over the scroll arrow', async () => {
    mount(520)
    const box = scroller()
    await waitFor(() => expect(headers().some((h) => h?.startsWith('Client'))).toBe(false))
    const [first, second] = screen.getAllByRole('columnheader')
    // Scroll until the second column's end (and its handle) sits under the first column.
    const f = first!.getBoundingClientRect()
    box.scrollLeft = second!.getBoundingClientRect().right - (f.right - 8)
    fireEvent.scroll(box)
    await waitFor(() => expect(second!.getBoundingClientRect().right).toBeLessThan(f.right))
    const edge = second!.getBoundingClientRect().right
    for (let x = edge - 6; x <= edge + 6; x += 2) expect(first!.contains(document.elementFromPoint(x, f.top + f.height / 2)), `x ${x}`).toBe(true)
    const arrow = await screen.findByRole('button', { name: 'Scroll to more columns' })
    const a = arrow.getBoundingClientRect()
    expect(arrow.contains(document.elementFromPoint(a.left + 2, a.top + a.height / 2))).toBe(true)
  })

  it('the column it’s sorted by never drops', async () => {
    render(
      <div style={{ width: 900 }}>
        <DataTable columns={columns.map((c) => ({ ...c, sort: 'text' as const }))} rows={rows} rowKey={(r) => r.id} storageKey="test-table-sorted" label="Projects" sort={{ by: 'client', dir: 'asc' }} onSort={() => {}} />
      </div>,
    )
    await waitFor(() => expect(headers().some((h) => h?.startsWith('Manager'))).toBe(false))
    expect(headers().some((h) => h?.startsWith('Client'))).toBe(true)
  })
})
