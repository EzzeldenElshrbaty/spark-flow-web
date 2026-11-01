// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '@/api/types'
import { api } from '@/lib/api'
import { DesktopSearch } from '@/layout/GlobalSearch'
import { ALL_PERMISSIONS } from '@/lib/permissions'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
const me = { id: 'u-1', name: 'Youssef Abdelrahman', email: 'y@spark-sys.com', roleIds: ['admin'], grants: [...ALL_PERMISSIONS], teamIds: [] } as unknown as Me

beforeEach(() => {
  vi.spyOn(api.users, 'me').mockResolvedValue(me)
  vi.spyOn(api.users, 'list').mockResolvedValue([me])
  vi.spyOn(api.workspaces, 'list').mockResolvedValue([{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }])
  vi.spyOn(api.chat, 'channels').mockResolvedValue([])
  vi.spyOn(api.projects, 'list').mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Where() {
  const { pathname, search } = useLocation()
  return <div data-testid="where">{pathname + decodeURIComponent(search)}</div>
}
async function mount(at = '/w/engineering/c/c-general') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route
            path="/w/:ws/*"
            element={
              <>
                <DesktopSearch />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await act(async () => {})
  return screen.getByRole('combobox')
}
const where = () => screen.getByTestId('where').textContent

describe('the top bar search opens Search (spec 6.12, 5.2)', () => {
  it('offers “Search messages and files for …” last; picking it opens Search with the words', async () => {
    const box = await mount()
    fireEvent.change(box, { target: { value: 'deploy notes' } })
    const options = screen.getAllByRole('option')
    expect(options.at(-1)!.textContent).toContain('Search messages and files for “deploy notes”')
    fireEvent.click(options.at(-1)!)
    expect(where()).toBe('/w/engineering/search?q=deploy notes')
  })
  it('⌘/Ctrl+Enter opens Search from anywhere in the list', async () => {
    const box = await mount()
    fireEvent.change(box, { target: { value: 'settings' } })
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true })
    expect(where()).toBe('/w/engineering/search?q=settings')
  })
  it('on Search the box shows the query, with × to clear it', async () => {
    const box = await mount(`/w/engineering/search?q=${encodeURIComponent('deploy in:#backend')}`)
    expect((box as HTMLInputElement).value).toBe('deploy in:#backend')
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy()
  })
})
