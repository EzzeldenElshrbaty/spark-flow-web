import '@/index.css'
import { act, cleanup, render, screen } from '@testing-library/react'
import { StrictMode, useEffect, useState } from 'react'
import { createMemoryRouter, Link, Outlet, RouterProvider, useLocation, useNavigate, useSearchParams } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { RouteFocus } from './RouteFocus'

// UX Phase 5A, 5.7: after a move to another page from the navigation, focus goes to the new page's heading; a change
// made inside the page (a tab, a filter, a panel) leaves focus where it is.

afterEach(cleanup)

/** The top bar's search box: it takes the caret when a page sends it there (⌘F, the channel's 🔍, /search). */
function TopSearch() {
  const location = useLocation()
  return (
    <input
      aria-label="Search everything"
      ref={(el) => {
        if (el && (location.state as { focus?: string } | null)?.focus === 'search') el.focus()
      }}
    />
  )
}

function SignIn() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/home', { replace: true })}>
      Sign in
    </button>
  )
}

function Shell() {
  return (
    <>
      <TopSearch />
      <nav aria-label="Workspace">
        <Link to="/projects">Projects</Link>
        <Link to="/slow">Slow page</Link>
        <Link to="/projects" state={{ focus: 'search' }}>
          Search from here
        </Link>
      </nav>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <RouteFocus />
    </>
  )
}

function Projects() {
  const [params, setParams] = useSearchParams()
  return (
    <>
      <h1>Projects</h1>
      <input aria-label="Search projects" value={params.get('q') ?? ''} onChange={(e) => setParams({ q: e.target.value })} />
      <Link to="/projects?ticket=NEX-1">Open NEX-1</Link>
      <Link to="/p/tasks">Tasks tab</Link>
    </>
  )
}

function Project() {
  return (
    <>
      <h1>Nexus Core</h1>
      <Link to="/p/board">Board tab</Link>
    </>
  )
}

function Slow() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 300)
    return () => clearTimeout(t)
  }, [])
  return ready ? <h1>Slow page</h1> : <p>Loading</p>
}

function mount(at = '/home', strict = false) {
  const router = createMemoryRouter(
    [{ path: '/signin', element: <SignIn /> }, { element: <Shell />, children: [{ path: '/home', element: <h1>Home</h1> }, { path: '/projects', element: <Projects /> }, { path: '/p/:tab', element: <Project /> }, { path: '/slow', element: <Slow /> }] }],
    { initialEntries: [at] },
  )
  render(strict ? <StrictMode><RouterProvider router={router} /></StrictMode> : <RouterProvider router={router} />)
  return router
}

describe('focus after a page change (UX Phase 5A, 5.7)', () => {
  it('leaves focus alone on the first load', () => {
    mount('/projects')
    expect(document.activeElement).toBe(document.body)
  })

  it('leaves focus alone on the first load in StrictMode too, where effects run twice (the dev build)', async () => {
    mount('/projects', true)
    await new Promise((r) => setTimeout(r, 50))
    expect(document.activeElement).toBe(document.body)
  })

  it('after Skip to content (focus on <main> itself), G then P still puts focus on the new heading (UX Phase 6, #29)', async () => {
    const router = mount('/home')
    document.getElementById('main')!.focus()
    await act(() => router.navigate('/projects'))
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Projects' })))
  })

  it('a sidebar link puts focus on the new page’s heading', async () => {
    mount()
    await userEvent.click(screen.getByRole('link', { name: 'Projects' }))
    // The link reads "Projects" too: wait for the heading itself.
    await expect.poll(() => document.activeElement?.tagName).toBe('H1')
    expect(document.activeElement?.textContent).toBe('Projects')
  })

  it('waits for a heading that shows after the page loads', async () => {
    mount()
    await userEvent.click(screen.getByRole('link', { name: 'Slow page' }))
    await expect.poll(() => document.activeElement?.textContent, { timeout: 2000 }).toBe('Slow page')
  })

  it('a filter, a panel or a tab inside the page leaves focus where it is', async () => {
    const router = mount('/projects')
    const search = screen.getByRole('textbox', { name: 'Search projects' })
    await userEvent.type(search, 'nex')
    expect(document.activeElement).toBe(search)
    await userEvent.click(screen.getByRole('link', { name: 'Open NEX-1' }))
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Open NEX-1' }))
    await act(async () => void (await router.navigate('/p/tasks')))
    const tab = screen.getByRole('link', { name: 'Board tab' })
    tab.focus()
    await userEvent.click(tab)
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Board tab' }))
  })
})

describe('focus a person or a page put elsewhere stays (final review)', () => {
  it('a page sent with the caret for the search box keeps it there', async () => {
    mount()
    await userEvent.click(screen.getByRole('link', { name: 'Search from here' }))
    await new Promise((r) => setTimeout(r, 100))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search everything' }))
  })

  it('focus moved while the page’s heading is on its way stays where it was moved', async () => {
    mount()
    await userEvent.click(screen.getByRole('link', { name: 'Slow page' }))
    screen.getByRole('textbox', { name: 'Search everything' }).focus()
    await screen.findByRole('heading', { name: 'Slow page' }, { timeout: 2000 })
    await new Promise((r) => setTimeout(r, 50))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search everything' }))
  })

  it('after signing in (a move into the app, not a page load) focus goes to the page’s heading', async () => {
    mount('/signin')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await expect.poll(() => document.activeElement?.tagName).toBe('H1')
    expect(document.activeElement?.textContent).toBe('Home')
  })
})

