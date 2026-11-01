// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountState } from './AccountState'

afterEach(cleanup)

describe('AccountState (slices 3, AB)', () => {
  it('an account that didn’t load offers Try again (signed out goes to Sign in instead, in AppLayout)', () => {
    render(<AccountState error={new Error('Network')} onRetry={() => {}} retrying={false} />)
    expect(screen.getByRole('heading', { name: "We couldn't load your account." })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
