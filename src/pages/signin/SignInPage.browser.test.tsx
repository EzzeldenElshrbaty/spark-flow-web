import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError } from '@/lib/api'
import { ThemeProvider } from '@/lib/ThemeProvider'
import { SignInPage } from './SignInPage'

// Spec 10 and CLAUDE.md: Sign in (slice AB) reads well in light and dark (axe, contrast included) and fits a 390px phone.

beforeEach(() => {
  vi.spyOn(api.users, 'me').mockRejectedValue(new ApiError({ title: 'Signed out', status: 401, detail: 'Signed out' }))
  vi.spyOn(api.auth, 'demoPeople').mockResolvedValue([
    { id: 'u-1', name: 'Youssef Abdelrahman', email: 'youssef.abdelrahman@spark-sys.com', title: 'Managing Director', roles: ['Admin'] },
    { id: 'u-2', name: 'Nour El-Sayed', email: 'nour.elsayed@spark-sys.com', title: 'Project Manager · Backend', roles: ['Project manager'] },
  ])
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
  await page.viewport(414, 896)
})

function mount(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <MemoryRouter initialEntries={['/signin?why=deactivated']}>
          <Routes>
            <Route path="/signin" element={<SignInPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

async function violations() {
  const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
  await Promise.all(finite.map((a) => a.finished.catch(() => undefined)))
  const result = await axe.run(document)
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`)
}

describe.each([
  ['light', false],
  ['dark', true],
])('Sign in in %s', (_theme, dark) => {
  it('the page, with its brand panel and the demo list, has no axe violations', async () => {
    await page.viewport(1440, 900)
    mount(dark)
    await screen.findByRole('list', { name: 'Demo people' })
    expect(await violations()).toEqual([])
  })
})

describe('Sign in on a 390px phone', () => {
  it('only the form shows, with 44px rows and button, and no sideways scroll', async () => {
    await page.viewport(390, 844)
    mount(false)
    const list = await screen.findByRole('list', { name: 'Demo people' })
    expect(screen.getByRole('button', { name: 'Sign in' }).getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    for (const row of list.querySelectorAll('button')) expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
    expect(await violations()).toEqual([])
  })
})
