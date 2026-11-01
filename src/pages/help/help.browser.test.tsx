import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api } from '@/lib/api'
import { ALL_PERMISSIONS, BUILT_IN_ROLES } from '@/lib/permissions'
import { PageHelpPanel } from '@/layout/PageHelpPanel'
import { useUiStore } from '@/lib/uiStore'
import { HelpPage } from './HelpPage'

// Spec 10 and CLAUDE.md: the help centre and the panel read well in light and dark (axe, contrast included) and fit a
// 390px phone (Admin and help, slice 6).

beforeEach(() => {
  vi.spyOn(api.users, 'me').mockResolvedValue({ id: 'u-1', name: 'Youssef Abdelrahman', email: '', title: '', roleIds: ['admin'], presence: 'active', teamIds: [], grants: [...ALL_PERMISSIONS] })
  vi.spyOn(api.roles, 'list').mockResolvedValue(BUILT_IN_ROLES.map((r) => ({ id: r.id, name: r.name, builtIn: true, grants: [...r.grants], holders: 1 })))
  vi.spyOn(api.workspaces, 'list').mockResolvedValue([{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }])
  useUiStore.setState({ helpOpen: true })
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
  await page.viewport(414, 896)
})

function mount(path: string, dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <main className="bg-canvas p-4">
          <Routes>
            <Route path="/w/:ws/help/:chapter?" element={<HelpPage />} />
            <Route path="/w/:ws/*" element={<PageHelpPanel />} />
          </Routes>
        </main>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** `page-has-heading-one` can be left out: the panel is mounted alone here, without the page it sits beside. */
async function violations(alone = false) {
  const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
  await Promise.all(finite.map((a) => a.finished.catch(() => undefined)))
  const result = await axe.run(document, { rules: { region: { enabled: false }, ...(alone && { 'page-has-heading-one': { enabled: false } }) } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`)
}

describe.each([
  ['light', false],
  ['dark', true],
])('Help in %s', (_theme, dark) => {
  it('the help centre, with a chapter that has a picture and a tip, has no axe violations', async () => {
    await page.viewport(1440, 900)
    mount('/w/engineering/help/attendance', dark)
    await screen.findByRole('heading', { name: 'Attendance', level: 2 })
    expect(await violations()).toEqual([])
  })

  it('the panel beside a page has no axe violations', async () => {
    await page.viewport(1280, 900)
    mount('/w/engineering/settings/audit', dark)
    await screen.findByRole('complementary', { name: 'Help for this page' })
    expect(await violations(true)).toEqual([])
  })
})

describe('Help on a 390px phone', () => {
  it('the help centre fits, with a chapter picker instead of the list; the panel rises from the bottom', async () => {
    await page.viewport(390, 844)
    mount('/w/engineering/help/time-cost', false)
    await screen.findByRole('heading', { name: 'Time and cost', level: 2 })
    expect(screen.getByRole('combobox', { name: 'Chapter' }).getBoundingClientRect().height).toBeGreaterThanOrEqual(36)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
    cleanup()
    mount('/w/engineering/time', false)
    const panel = await screen.findByRole('complementary', { name: 'Help for this page' })
    await violations()
    const box = panel.getBoundingClientRect()
    expect(box.width).toBe(390)
    expect(box.bottom).toBeCloseTo(844, 0)
    expect(screen.getByRole('button', { name: 'Close help' }).getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390)
  })
})
