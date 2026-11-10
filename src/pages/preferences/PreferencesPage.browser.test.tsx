import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Preferences } from '@/api/types'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/apiError'
import { PreferencesPage } from '@/pages/preferences/PreferencesPage'

// Spec 10 and CLAUDE.md: the page reads well in light and dark (axe, contrast included) and fits a 390px phone.

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  defaultLevel: 'mentions', keywords: ['deploy', 'release notes'], desktop: false, push: true, emailDigest: 'daily',
  dndUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
  dndSchedule: { on: true, from: '18:00', to: '09:00', days: [0, 1, 2, 3, 4], tz: 'Africa/Cairo' },
  singleKeyShortcuts: true,
  ...over,
})

function mount(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <main className={dark ? 'dark' : undefined}>
          <PreferencesPage />
        </main>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Axe over the whole page; `region` is left out, as for the chat: menus open in a portal outside the page's landmarks. */
async function violations() {
  const result = await axe.run(document, { rules: { region: { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`)
}

beforeEach(() => {
  vi.spyOn(api.preferences, 'get').mockResolvedValue(prefs())
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
})

describe.each([
  ['light', false],
  ['dark', true],
])('Preferences in %s (spec 6.11, 10)', (_theme, dark) => {
  it('has no axe violations, paused, with keywords and a refusal in a section', async () => {
    vi.spyOn(api.preferences, 'update').mockRejectedValue(new ApiError({ status: 400, title: 'Keywords are at most 40 characters.' }))
    mount(dark)
    expect(await screen.findByText(/Notifications are paused until/)).toBeTruthy()
    await userEvent.click(screen.getByRole('radio', { name: 'All new messages' }))
    expect(await screen.findByText('Keywords are at most 40 characters.')).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('the open Pause notifications menu has no axe violations', async () => {
    mount(dark)
    await userEvent.click(await screen.findByRole('button', { name: /Pause notifications/ }))
    expect(screen.getByRole('menuitem', { name: '30 minutes' })).toBeTruthy()
    expect(await violations()).toEqual([])
  })
})

describe('Preferences on a 390px phone', () => {
  beforeEach(async () => {
    await page.viewport(390, 844)
  })
  afterEach(async () => {
    await page.viewport(414, 896)
  })

  it('fits without sideways scrolling, and Pause notifications is a touch target', async () => {
    mount(false)
    await screen.findByText(/Notifications are paused until/)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
    for (const el of document.querySelectorAll<HTMLElement>('main button, main [role="switch"]')) {
      const box = el.getBoundingClientRect()
      expect(box.right, el.outerHTML.slice(0, 120)).toBeLessThanOrEqual(390)
    }
    // A kit button 44px tall on phones (UX Phase 3: Preferences in the standard look; spec 6.16).
    const pause = screen.getByRole('button', { name: /Pause notifications/ })
    expect(pause.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })
})
