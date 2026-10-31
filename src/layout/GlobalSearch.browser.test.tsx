import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import type { Me } from '@/api/types'
import { api } from '@/lib/api'
import { DesktopSearch } from '@/layout/GlobalSearch'
import { ALL_PERMISSIONS } from '@/lib/permissions'

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
                  <DesktopSearch />
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
