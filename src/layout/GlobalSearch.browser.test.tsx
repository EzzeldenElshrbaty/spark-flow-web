import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Me } from '@/api/types'
import { api } from '@/lib/api'
import { DesktopSearch, PhoneSearch } from '@/layout/GlobalSearch'
import { ALL_PERMISSIONS } from '@/lib/permissions'

// A running timer or none, for the top bar's room (UX Phase 5B, 5.3).
let running = false
vi.mock('@/layout/useMyTimer', () => ({ useMyTimer: () => (running ? { timer: { state: 'running' }, task: undefined, label: 'Login' } : null) }))

const me = { id: 'u-1', name: 'Youssef Abdelrahman', email: 'y@spark-sys.com', roleIds: ['admin'], grants: [...ALL_PERMISSIONS], teamIds: [] } as unknown as Me
beforeEach(async () => {
  // The box shows from tablets up.
  await page.viewport(1000, 800)
  vi.spyOn(api.users, 'me').mockResolvedValue(me)
  vi.spyOn(api.users, 'list').mockResolvedValue([me])
  vi.spyOn(api.workspaces, 'list').mockResolvedValue([{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }])
  vi.spyOn(api.chat, 'channels').mockResolvedValue([])
  vi.spyOn(api.projects, 'list').mockResolvedValue([])
})
afterEach(async () => {
  running = false
  await page.viewport(414, 896)
  cleanup()
  vi.restoreAllMocks()
})

let go: ReturnType<typeof useNavigate>
function Probe() {
  go = useNavigate()
  const { state } = useLocation()
  return <div data-testid="state">{JSON.stringify(state)}</div>
}

describe('arriving on Search from the channel’s 🔍 or ⌘F (spec 6.12)', () => {
  it('puts the caret after the query once; Back to that entry later doesn’t take focus again', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/w/engineering/c/c-backend', { pathname: '/w/engineering/search', search: `?q=${encodeURIComponent('in:#backend ')}`, state: { focus: 'search' } }]} initialIndex={1}>
          <Routes>
            <Route
              path="/w/:ws/*"
              element={
                <div className="sf" style={{ width: 900 }}>
                  <DesktopSearch onOpenScreen={() => {}} />
                  <Probe />
                </div>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const box = screen.getByRole('combobox') as HTMLInputElement
    await vi.waitFor(() => expect(document.activeElement).toBe(box))
    expect(box.selectionStart).toBe('in:#backend '.length)
    await vi.waitFor(() => expect(screen.getByTestId('state').textContent).toBe('null'))
    box.blur()
    await act(async () => go(-1))
    await act(async () => go(1))
    await new Promise((r) => setTimeout(r, 100))
    expect(document.activeElement).not.toBe(box)
  })
})

/** The top bar's two ways in, as TopBar wires them: the box, and the round button with its screen. */
function Bar({ at = '/w/engineering/dashboard', state }: { at?: string; state?: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: at.split('?')[0]!, search: at.includes('?') ? `?${at.split('?')[1]}` : '', state }]}>
        <Routes>
          <Route
            path="/w/:ws/*"
            element={
              <header className="sf flex items-center gap-2">
                <DesktopSearch onOpenScreen={() => setOpen(true)} />
                <PhoneSearch open={open} onOpenChange={setOpen} />
              </header>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const shown = (el: Element | null) => Boolean(el && el.getClientRects().length > 0)

describe('the laptop top bar while a timer runs (UX Phase 5B, 5.3)', () => {
  it('below 1280 with a timer: a round Search button instead of the box; ⌘K opens the search screen; Escape gives focus back', async () => {
    running = true
    await page.viewport(1100, 800)
    render(<Bar />)
    expect(shown(screen.queryByRole('combobox'))).toBe(false)
    const button = screen.getByRole('button', { name: 'Search' })
    expect(shown(button)).toBe(true)
    await userEvent.keyboard('{Meta>}k{/Meta}')
    const dialog = await screen.findByRole('dialog', { name: 'Search' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull()
    await userEvent.click(button)
    await screen.findByRole('dialog', { name: 'Search' })
    await userEvent.keyboard('{Escape}')
    expect(document.activeElement).toBe(button)
  })

  it('below 1280 without a timer, and at 1440 with one: the box shows', async () => {
    await page.viewport(1100, 800)
    render(<Bar />)
    const box = screen.getByRole('combobox')
    expect(shown(box)).toBe(true)
    expect(box.getBoundingClientRect().width).toBeGreaterThanOrEqual(200)
    cleanup()
    running = true
    await page.viewport(1440, 900)
    render(<Bar />)
    expect(shown(screen.getByRole('combobox'))).toBe(true)
  })

  it('arriving with the caret for search (⌘F, the channel’s 🔍) opens the screen with the query', async () => {
    running = true
    await page.viewport(1100, 800)
    render(<Bar at={`/w/engineering/search?q=${encodeURIComponent('in:#backend ')}`} state={{ focus: 'search' }} />)
    const dialog = await screen.findByRole('dialog', { name: 'Search' })
    const field = dialog.querySelector('input')!
    await vi.waitFor(() => expect(document.activeElement).toBe(field))
    expect(field.value).toBe('in:#backend ')
  })
})

describe('the folded search never stays open hidden, nor drops the caret (final review)', () => {
  it('a screen open at 1100 closes when the timer stops (the box is back)', async () => {
    running = true
    await page.viewport(1100, 800)
    const { rerender } = render(<Bar />)
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('dialog', { name: 'Search' })
    running = false
    rerender(<Bar />)
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"][aria-label="Search"]')).toBeNull())
  })

  it('the box folding away while it has the caret gives focus to the Search button', async () => {
    await page.viewport(1100, 800)
    const { rerender } = render(<Bar />)
    screen.getByRole('combobox').focus()
    running = true
    rerender(<Bar />)
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Search' })))
  })
})
