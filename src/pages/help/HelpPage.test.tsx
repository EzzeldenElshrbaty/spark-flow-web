// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Me } from '@/api/types'
import { api } from '@/lib/api'
import { ALL_PERMISSIONS, BUILT_IN_ROLES } from '@/lib/permissions'
import { PageHelpPanel } from '@/layout/PageHelpPanel'
import { useUiStore } from '@/lib/uiStore'
import { HelpPage } from './HelpPage'

// Help (Admin and help, slice 6): the help centre, and the panel beside a page.

Element.prototype.scrollIntoView ??= function () {}
Element.prototype.scrollTo ??= function () {}

let me: Me
beforeEach(() => {
  me = { id: 'u-1', name: 'Youssef Abdelrahman', email: '', title: '', roleIds: ['admin'], presence: 'active', teamIds: [], grants: [...ALL_PERMISSIONS] }
  vi.spyOn(api.users, 'me').mockImplementation(async () => me)
  vi.spyOn(api.roles, 'list').mockResolvedValue(BUILT_IN_ROLES.map((r) => ({ id: r.id, name: r.name, builtIn: true, grants: [...r.grants], holders: 1 })))
  vi.spyOn(api.workspaces, 'list').mockResolvedValue([{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }])
  useUiStore.setState({ helpOpen: false })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Address() {
  const { pathname, hash } = useLocation()
  return <output data-testid="address">{pathname + hash}</output>
}

function mount(path: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/w/:ws/help/:chapter?" element={<><HelpPage /><Address /></>} />
          <Route path="/w/:ws/*" element={<><PageHelpPanel /><Address /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the help centre', () => {
  it('opens on Getting started, says whose roles it shows for, and groups the chapters like the sidebar', async () => {
    mount('/w/engineering/help')
    expect(await screen.findByRole('heading', { name: 'Getting started', level: 2 })).toBeTruthy()
    expect(await screen.findByText('Shown for your roles: Admin.')).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Chapters' })
    expect(within(nav).getByRole('link', { name: 'Audit log' }).getAttribute('href')).toBe('/w/engineering/help/audit-log')
    expect(within(screen.getByRole('group', { name: 'Topics' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Getting started', 'Work', 'Chat', 'Manage', 'Settings'])
  })

  it('a chapter for some people says who; a member sees only what their roles allow', async () => {
    mount('/w/engineering/help/audit-log')
    expect(await screen.findByText('For people who can see the audit log.')).toBeTruthy()
    cleanup()
    me = { ...me, roleIds: ['member'], grants: ['checkins.managed'] }
    mount('/w/engineering/help/audit-log')
    expect(await screen.findByText(/That chapter isn't in your help\./)).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Chapters' })
    expect(within(nav).queryByRole('link', { name: 'Audit log' })).toBeNull()
    expect(within(nav).getByRole('link', { name: 'Attendance' })).toBeTruthy()
  })

  it('search lists the chapters that mention it, with the words around it; a topic chip narrows the chapters', async () => {
    mount('/w/engineering/help')
    await screen.findByRole('heading', { name: 'Getting started', level: 2 })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), { target: { value: 'tamper' } })
    const result = await screen.findByRole('button', { name: /Audit log/ })
    expect(result.textContent).toMatch(/tamper/i)
    fireEvent.click(result)
    expect(screen.getByTestId('address').textContent).toBe('/w/engineering/help/audit-log')
    fireEvent.click(within(screen.getByRole('group', { name: 'Topics' })).getByRole('button', { name: 'Chat' }))
    expect(within(screen.getByRole('navigation', { name: 'Chapters' })).getAllByRole('link').map((a) => a.textContent)).toEqual(['Channels and messages', 'Threads and Activity', 'Search', 'Saved, drafts and sent', 'Preferences'])
  })

  it('a link to another chapter opens it', async () => {
    mount('/w/engineering/help/time-cost')
    fireEvent.click(await screen.findByRole('link', { name: 'hourly cost' }))
    expect(screen.getByTestId('address').textContent).toBe('/w/engineering/help/rates')
    expect(await screen.findByRole('heading', { name: 'Hourly cost', level: 2 })).toBeTruthy()
  })
})

describe('who reads what', () => {
  it('a link to a chapter the reader can’t open reads as text', async () => {
    me = { ...me, roleIds: ['member'], grants: ['checkins.managed'] }
    mount('/w/engineering/help/teams')
    await screen.findByRole('heading', { name: 'Teams', level: 2 })
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull()
    expect(screen.getByText('Users')).toBeTruthy()
  })

  it('whoever manages a project reads the Dashboard chapter, whatever their roles', async () => {
    me = { ...me, id: 'u-2', roleIds: ['pm'], grants: ['checkins.managed'] }
    mount('/w/engineering/help/dashboard')
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 2 })).toBeTruthy()
  })
})

describe('the help panel beside a page', () => {
  it('shows the page’s sections only, follows a link inside with a way back, and leads to the help centre', async () => {
    useUiStore.setState({ helpOpen: true })
    mount('/w/engineering/threads')
    const panel = await screen.findByRole('complementary', { name: 'Help for this page' })
    expect(within(panel).getByRole('heading', { name: 'Threads', level: 2 })).toBeTruthy()
    expect(within(panel).queryByText(/Activity \(/)).toBeNull()
    expect(within(panel).getByRole('link', { name: /Open the help centre/ }).getAttribute('href')).toBe('/w/engineering/help/threads-activity')
    cleanup()
    mount('/w/engineering/settings/attendance')
    const attendance = await screen.findByRole('complementary', { name: 'Help for this page' })
    fireEvent.click(within(attendance).getByRole('button', { name: 'Close help' }))
    expect(useUiStore.getState().helpOpen).toBe(false)
  })

  it('a link inside opens that chapter here; Back returns; Escape closes it', async () => {
    useUiStore.setState({ helpOpen: true })
    mount('/w/engineering')
    const panel = await screen.findByRole('complementary', { name: 'Help for this page' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Attendance' }))
    expect(within(panel).getByRole('heading', { name: 'Attendance', level: 2 })).toBeTruthy()
    fireEvent.click(within(panel).getByRole('button', { name: 'Back to this page' }))
    expect(within(panel).getByRole('heading', { name: 'Home and My day', level: 2 })).toBeTruthy()
    // Escape while typing belongs to the field.
    const field = document.body.appendChild(document.createElement('input'))
    field.focus()
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))
    expect(screen.getByRole('complementary')).toBeTruthy()
    field.remove()
    fireEvent.click(within(panel).getByRole('button', { name: 'Attendance' }))
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))
    expect(screen.queryByRole('complementary')).toBeNull()
    // Opened again, it shows the page's own help, not the chapter followed before.
    act(() => useUiStore.setState({ helpOpen: true }))
    expect(within(await screen.findByRole('complementary')).getByRole('heading', { name: 'Home and My day', level: 2 })).toBeTruthy()
  })

  it('a thread, task or file panel takes the side: help steps aside', async () => {
    useUiStore.setState({ helpOpen: true })
    mount('/w/engineering/p/NEX/tasks?ticket=NEX-101')
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(useUiStore.getState().helpOpen).toBe(false)
  })

  it('nothing on a page whose help this person can’t read', async () => {
    useUiStore.setState({ helpOpen: true })
    me = { ...me, roleIds: ['member'], grants: [] }
    mount('/w/engineering/settings/audit')
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})
