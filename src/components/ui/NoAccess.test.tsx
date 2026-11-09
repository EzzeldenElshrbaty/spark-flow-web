// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { NoAccess } from './NoAccess'

afterEach(cleanup)

describe('NoAccess (UX Phase 2, 2.1: the way out is the Dashboard, everyone’s start page)', () => {
  it('says what I can’t open and links to the Dashboard', () => {
    render(
      <MemoryRouter>
        <NoAccess ws="engineering" what="archived records" />
      </MemoryRouter>,
    )
    expect(screen.getByText(/You don’t have access to archived records\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Dashboard' }).getAttribute('href')).toBe('/w/engineering/dashboard')
  })
})
