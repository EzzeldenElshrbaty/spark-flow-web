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
vi.mock('@/api/rates', () => ({
  useRates: () => ({ data: [{ userId: 'u-2', hourlyCost: 420, effectiveFrom: '1970-01-01T00:00:00.000Z' }], isPending: false, isError: false }),
  useUpdateRate: () => ({ mutate: vi.fn(), isPending: false, error: null }),
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
