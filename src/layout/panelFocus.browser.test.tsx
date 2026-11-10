import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { useInspectorEscape, useInspectorFocus } from '@/layout/Inspector'
import { InspectorFrame, PanelOpened } from '@/layout/InspectorFrame'

// UX Phase 5A, 5.5: the task, thread and file panel takes focus when opened, gives it back when closed, and on a
// phone is a modal bottom sheet.

afterEach(cleanup)

/** A page with a task row, and the panel as the Inspector shows it (keyed by record). */
function Board({ start = null }: { start?: string | null }) {
  const [key, setKey] = useState<string | null>(start)
  const opened = useInspectorFocus(key !== null)
  useInspectorEscape(key !== null, () => setKey(null))
  return (
    <main>
      <h1>Board</h1>
      <button type="button" onClick={() => setKey('NEX-1')}>
        NEX-1 Login
      </button>
      <button type="button">NEX-7 Billing</button>
      {key && (
        <PanelOpened.Provider value={opened}>
          <InspectorFrame key={key} label="Task" title={key} onClose={() => setKey(null)}>
            <button type="button" onClick={() => setKey('NEX-2')}>
              Go to NEX-2
            </button>
          </InspectorFrame>
        </PanelOpened.Provider>
      )}
    </main>
  )
}

describe('the side panel’s focus (UX Phase 5A, 5.5)', () => {
  it('at 1280: focus moves to the panel’s heading, follows a link to another task, and goes back to the row on ×', async () => {
    await page.viewport(1280, 800)
    render(<Board />)
    const row = screen.getByRole('button', { name: 'NEX-1 Login' })
    await userEvent.click(row)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'NEX-1' }))
    expect(screen.getByRole('complementary', { name: 'Task' }).getAttribute('aria-modal')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Go to NEX-2' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'NEX-2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close task' }))
    expect(document.activeElement).toBe(row)
  })

  it('a panel already open when the page loads leaves focus alone', async () => {
    await page.viewport(1280, 800)
    render(<Board start="NEX-1" />)
    expect(document.activeElement).toBe(document.body)
  })

  it('at 390: a modal bottom sheet that keeps Tab inside; the scrim and Esc close it', async () => {
    await page.viewport(390, 844)
    render(<Board />)
    await userEvent.click(screen.getByRole('button', { name: 'NEX-1 Login' }))
    const sheet = screen.getByRole('dialog', { name: 'Task' })
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    const go = screen.getByRole('button', { name: 'Go to NEX-2' })
    go.focus()
    await userEvent.keyboard('{Tab}')
    expect(sheet.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Task' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'NEX-1 Login' }))
    await userEvent.click(document.querySelector<HTMLElement>('[data-scrim]')!, { position: { x: 10, y: 10 } })
    expect(screen.queryByRole('dialog', { name: 'Task' })).toBeNull()
  })
})

describe('the side panel leaves focus a person moved on (final review)', () => {
  it('at 1280, focus moved to another row stays there when Esc closes the panel', async () => {
    await page.viewport(1280, 800)
    render(<Board />)
    await userEvent.click(screen.getByRole('button', { name: 'NEX-1 Login' }))
    const other = screen.getByRole('button', { name: 'NEX-7 Billing' })
    other.focus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('complementary', { name: 'Task' })).toBeNull()
    expect(document.activeElement).toBe(other)
  })
})

describe('the panel wherever it covers the page (UX Phase 5B)', () => {
  it('at 1024 it is a modal: a dialog with a dimmed page, Tab kept inside; at 1280 it sits beside the page', async () => {
    await page.viewport(1024, 768)
    render(<Board />)
    await userEvent.click(screen.getByRole('button', { name: 'NEX-1 Login' }))
    const sheet = screen.getByRole('dialog', { name: 'Task' })
    expect(sheet.getAttribute('aria-modal')).toBe('true')
    expect(document.querySelector('[data-scrim]')).not.toBeNull()
    screen.getByRole('button', { name: 'Go to NEX-2' }).focus()
    await userEvent.keyboard('{Tab}{Tab}{Tab}')
    expect(sheet.contains(document.activeElement)).toBe(true)
    cleanup()
    await page.viewport(1280, 800)
    render(<Board />)
    await userEvent.click(screen.getByRole('button', { name: 'NEX-1 Login' }))
    expect(screen.getByRole('complementary', { name: 'Task' })).toBeTruthy()
    expect(document.querySelector('[data-scrim]')).toBeNull()
  })
})

