// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LastVisitRedirect } from './LastVisitRedirect'

// `/` (dashboard start): a plain sign-in, the logo and "Back to Dashboard" land on the workspace's Dashboard.

vi.mock('@/layout/useCurrentWorkspace', () => ({
  useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }, isPending: false, isError: false }),
}))
afterEach(cleanup)

function Address() {
  return <p data-testid="address">{useLocation().pathname}</p>
}

describe('LastVisitRedirect', () => {
  it('sends / to the last workspace’s Dashboard', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LastVisitRedirect />} />
          <Route path="*" element={<Address />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('address').textContent).toBe('/w/engineering/dashboard')
  })
})
