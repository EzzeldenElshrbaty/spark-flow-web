// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { useUnsavedGuards, type UnsavedGuard } from '@/lib/unsavedChanges'
import { LeaveGuard } from '@/components/ui/LeaveGuard'
import { UnsavedChangesBlocker } from './UnsavedChangesBlocker'

afterEach(() => {
  cleanup()
  useUnsavedGuards.setState({ guards: [] })
})

function setup(path = '/a') {
  const router = createMemoryRouter([{ path: '*', element: <UnsavedChangesBlocker /> }], { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const addGuard = (scope: UnsavedGuard['scope']) => {
  const asked: { leave: () => void; stay: () => void }[] = []
  useUnsavedGuards.getState().add({ id: scope, scope, ask: (leave, stay) => asked.push({ leave, stay }) })
  return asked
}

describe('UnsavedChangesBlocker (UX Phase 1, 1.2)', () => {
  it('a page guard asks before leaving the page; leave goes on, stay keeps the page', async () => {
    const router = setup('/a')
    const asked = addGuard('page')
    await act(() => router.navigate('/b'))
    await waitFor(() => expect(asked).toHaveLength(1))
    expect(router.state.location.pathname).toBe('/a')
    act(() => asked[0]!.stay())
    expect(router.state.location.pathname).toBe('/a')
    await act(() => router.navigate('/b'))
    await waitFor(() => expect(asked).toHaveLength(2))
    act(() => asked[1]!.leave())
    await waitFor(() => expect(router.state.location.pathname).toBe('/b'))
  })

  it('a sheet guard lets a PUSH through (its form’s own Save) and asks on Back', async () => {
    const router = setup('/a')
    await act(() => router.navigate('/b'))
    const asked = addGuard('sheet')
    await act(() => router.navigate('/b?saved=1'))
    expect(router.state.location.search).toBe('?saved=1')
    expect(asked).toHaveLength(0)
    await act(() => router.navigate(-1))
    await waitFor(() => expect(asked).toHaveLength(1))
    expect(router.state.location.search).toBe('?saved=1')
  })

  it('asks the browser before the tab closes only while something is unsaved', () => {
    setup('/a')
    const fire = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(fire()).toBe(false)
    act(() => {
      addGuard('sheet')
    })
    expect(fire()).toBe(true)
    act(() => useUnsavedGuards.getState().remove('sheet'))
    expect(fire()).toBe(false)
  })
})


describe('LeaveGuard (a page with unsaved changes)', () => {
  it('asks "Leave without saving?" before another page; Stay keeps it, Leave without saving goes', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <>
              <UnsavedChangesBlocker />
              <LeaveGuard dirty description="2 changes to roles aren’t saved." />
            </>
          ),
        },
      ],
      { initialEntries: ['/roles'] },
    )
    render(<RouterProvider router={router} />)
    await act(() => router.navigate('/settings'))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeTruthy()
    expect(screen.getByText('2 changes to roles aren’t saved.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(router.state.location.pathname).toBe('/roles')
    await act(() => router.navigate('/settings'))
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings'))
  })
})
