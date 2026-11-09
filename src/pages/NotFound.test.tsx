// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { NotFound } from './NotFound'

afterEach(cleanup)

describe('Not found (UX Phase 2, 2.8)', () => {
  it('says what is missing as the page’s heading, with a way back', () => {
    render(
      <MemoryRouter>
        <NotFound what="page" backTo="/" backLabel="Back to Dashboard" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: "This page doesn't exist." })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toBeTruthy()
  })
})
