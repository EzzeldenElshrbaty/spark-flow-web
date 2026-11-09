// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UnsavedChangesBlocker } from '@/layout/UnsavedChangesBlocker'
import { RatesPage } from './RatesPage'

// UX Phase 1, 1.2: an hourly cost changed but not saved isn't lost by leaving the page.

const people = [
  { id: 'u-2', name: 'Nour El-Sayed', title: 'Project Manager', teamIds: [], roleIds: ['pm'] },
  { id: 'u-3', name: 'Mariam Fathy', title: 'Frontend Engineer', teamIds: [], roleIds: ['member'] },
]
let nourRate = 420
const updateRate = vi.fn()
vi.mock('@/api/rates', () => ({
  useRates: () => ({ data: [{ userId: 'u-2', hourlyCost: nourRate, effectiveFrom: '1970-01-01T00:00:00.000Z' }], isPending: false, isError: false }),
  useUpdateRate: () => ({ mutate: updateRate, isPending: false, error: null }),
}))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: people, isPending: false, isError: false }) }))
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering' } }) }))
vi.mock('@/lib/usePermission', () => ({ useAccess: () => 'allowed' }))

afterEach(cleanup)

describe('Hourly cost: leaving with a changed rate', () => {
  it('asks "Leave without saving?"; with nothing changed it doesn’t', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/w/:ws/settings/rates',
          element: (
            <>
              <UnsavedChangesBlocker />
              <RatesPage />
            </>
          ),
        },
        { path: '/w/:ws/settings', element: <p>Settings home</p> },
      ],
      { initialEntries: ['/w/engineering/settings/rates'] },
    )
    render(<RouterProvider router={router} />)
    fireEvent.change(screen.getByRole('spinbutton', { name: /Hourly cost for Nour El-Sayed/ }), { target: { value: '450' } })
    await act(() => router.navigate('/w/engineering/settings'))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeTruthy()
    expect(screen.getByText('Hourly costs you changed aren’t saved.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /Hourly cost for Nour El-Sayed/ }), { target: { value: '420' } })
    await act(() => router.navigate('/w/engineering/settings'))
    expect(router.state.location.pathname).toBe('/w/engineering/settings')
  })
})

describe('Hourly cost saves in place (UX Phase 4, 4.10)', () => {
  it('Enter in a rate saves it, then the row says "Saved." until it changes again', async () => {
    updateRate.mockImplementation((input: { hourlyCost: number }, { onSuccess }: { onSuccess: () => void }) => {
      nourRate = input.hourlyCost
      onSuccess()
    })
    const router = createMemoryRouter([{ path: '/w/:ws/settings/rates', element: <RatesPage /> }], { initialEntries: ['/w/engineering/settings/rates'] })
    const { rerender } = render(<RouterProvider router={router} />)
    const field = () => screen.getByRole('spinbutton', { name: /Hourly cost for Nour El-Sayed/ }) as HTMLInputElement
    fireEvent.change(field(), { target: { value: '450' } })
    await act(async () => fireEvent.submit(field().form!))
    expect(updateRate).toHaveBeenCalledWith({ userId: 'u-2', hourlyCost: 450 }, expect.anything())
    rerender(<RouterProvider router={router} />)
    expect(screen.getByText('Saved.')).toBeTruthy()
    fireEvent.change(field(), { target: { value: '460' } })
    expect(screen.queryByText('Saved.')).toBeNull()
    nourRate = 420
  })
})
