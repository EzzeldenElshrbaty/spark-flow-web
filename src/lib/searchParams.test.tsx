// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
// The app's provider (src/main.tsx): it wires ReactDOM.flushSync for the router.
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it } from 'vitest'
import { quietChange, useParam, useParamState } from './searchParams'

// UX Phase 2, 2.7: the address keeps state, and Back steps through what you chose (chips, selects, tabs), not each key
// you typed, nor a sheet you closed.

afterEach(cleanup)

describe('quietChange', () => {
  const options = { typed: ['q'], sheets: ['person'] }
  it('typing in a search box, or closing a sheet, replaces the entry; anything else is a new one', () => {
    expect(quietChange({ q: 'nou' }, options)).toBe(true)
    expect(quietChange({ person: null }, options)).toBe(true)
    expect(quietChange({ person: '' }, options)).toBe(true)
    expect(quietChange({ person: 'new' }, options)).toBe(false)
    expect(quietChange({ role: 'pm' }, options)).toBe(false)
    expect(quietChange({ q: 'x', role: 'pm' }, options)).toBe(false)
    expect(quietChange({ show: 'overdue' }, {})).toBe(false)
  })
})

describe('useParamState', () => {
  let set: (values: Record<string, string | null>) => void = () => {}
  function Page() {
    const [, setter] = useParamState({ typed: ['q'], sheets: ['person'] })
    set = setter
    return null
  }
  const setup = () => {
    const router = createMemoryRouter([{ path: '/users', element: <Page /> }], { initialEntries: ['/users'] })
    render(<RouterProvider router={router} />)
    return router
  }

  it('a filter is a step Back undoes; typing isn’t', async () => {
    const router = setup()
    await act(async () => set({ role: 'pm' }))
    await act(async () => set({ q: 'n' }))
    await act(async () => set({ q: 'no' }))
    expect(router.state.location.search).toBe('?role=pm&q=no')
    await act(() => router.navigate(-1))
    expect(router.state.location.search).toBe('')
  })

  it('choosing what is already chosen adds no step (final review)', async () => {
    const router = setup()
    await act(async () => set({ role: 'pm' }))
    await act(async () => set({ role: 'pm' }))
    await act(() => router.navigate(-1))
    expect(router.state.location.search).toBe('')
  })

  it('opening a sheet is a step Back closes; closing it doesn’t leave one to reopen it', async () => {
    const router = setup()
    await act(async () => set({ person: 'new' }))
    expect(router.state.historyAction).toBe('PUSH')
    await act(async () => set({ person: null }))
    expect(router.state.historyAction).toBe('REPLACE')
    expect(router.state.location.search).toBe('')
  })
})

describe('useParam for a search box (final review)', () => {
  function Box() {
    const [q, setQ] = useParam('q', { typed: true })
    return <input aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
  }

  it('typing in the middle keeps the caret where it was typed', async () => {
    const router = createMemoryRouter([{ path: '/help', element: <Box /> }], { initialEntries: ['/help?q=tamper'] })
    const { getByRole } = render(<RouterProvider router={router} />)
    const input = getByRole('textbox', { name: 'Search' }) as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(input, 'tamXper')
      input.setSelectionRange(4, 4)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(router.state.location.search).toBe('?q=tamXper')
    expect(input.value).toBe('tamXper')
    expect(input.selectionStart).toBe(4)
  })
})
