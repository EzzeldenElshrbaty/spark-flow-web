import '@/index.css'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { ColumnStripBar, useColumnStrip } from './ColumnStrip'

// UX Phase 4, 4.1: the board says which of its columns are in view, and from md has arrows to the others.

function Board({ count, addTile = false }: { count: number; addTile?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null)
  const strip = useColumnStrip(scroller, count)
  return (
    <div style={{ width: 'min(100vw, 1100px)' }}>
      <ColumnStripBar strip={strip} />
      <div className="relative">
        <div ref={scroller} data-testid="scroller" className="flex snap-x gap-3 overflow-x-auto px-4 md:px-0">
          {Array.from({ length: count }, (_, i) => (
            <section key={i} aria-label={`Column ${i}`} className="h-40 w-[85%] shrink-0 snap-start rounded-xl border md:w-[296px]" />
          ))}
          {addTile && (
            <button type="button" className="h-40 w-[296px] shrink-0 rounded-xl border">
              Add column
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

afterEach(async () => {
  cleanup()
  await page.viewport(414, 896)
})

describe('the board’s column strip', () => {
  it('on a laptop: says which columns show, and Later moves one column on until the end', async () => {
    await page.viewport(1280, 800)
    render(<Board count={6} />)
    await expect.poll(() => screen.queryByText('Columns 1–3 of 6')).toBeTruthy()
    const earlier = screen.getByRole('button', { name: 'Earlier columns' })
    const later = screen.getByRole('button', { name: 'Later columns' })
    expect((earlier as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(later)
    await expect.poll(() => screen.queryByText('Columns 2–4 of 6')).toBeTruthy()
    const scroller = screen.getByTestId('scroller')
    scroller.scrollLeft = scroller.scrollWidth
    fireEvent.scroll(scroller)
    await expect.poll(() => (later as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Columns 4–6 of 6')).toBeTruthy()
  })

  it('says nothing when every column fits', async () => {
    await page.viewport(1280, 800)
    render(<Board count={3} />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText(/of 3/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Later columns' })).toBeNull()
  })

  it('on a phone: one column at a time, no arrows', async () => {
    await page.viewport(390, 844)
    render(<Board count={6} />)
    await expect.poll(() => screen.queryByText('Column 1 of 6')).toBeTruthy()
    expect(getComputedStyle(screen.getByRole('button', { name: 'Later columns', hidden: true }).parentElement!).display).toBe('none')
  })

  it('every column in view with only Add column past the edge says nothing (UX Phase 6, deferred minor #19)', async () => {
    await page.viewport(1280, 800)
    render(<Board count={3} addTile />)
    const scroller = screen.getByTestId('scroller')
    await expect.poll(() => scroller.scrollWidth > scroller.clientWidth).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByText(/Columns? \d/)).toBeNull()
  })
})
