// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/apiError'
import { AccountState } from './AccountState'

afterEach(cleanup)

describe('AccountState in the prototype (slice 3)', () => {
  it('a deactivated person’s tab says why and points to View as; there is no sign-in page to send them to', () => {
    render(<AccountState error={new ApiError({ title: 'Signed out', status: 401, detail: 'This account was deactivated.' })} onRetry={() => {}} retrying={false} />)
    expect(screen.getByRole('heading', { name: "You're signed out." })).toBeTruthy()
    expect(screen.getByText("This account was deactivated. Pick someone under View as, in your avatar's menu, to carry on.")).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('anything else offers Try again', () => {
    render(<AccountState error={new Error('Network')} onRetry={() => {}} retrying={false} />)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
