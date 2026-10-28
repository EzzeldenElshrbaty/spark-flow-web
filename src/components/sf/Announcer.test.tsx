// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { announce, Announcer } from '@/components/sf/Announcer'

afterEach(cleanup)

describe('Announcer: the one polite live region', () => {
  it('reads out what it is given', () => {
    render(<Announcer />)
    act(() => announce('Link copied'))
    expect(screen.getByRole('status').textContent).toBe('Link copied')
  })

  it('the same words twice are read out twice (a new node each time)', () => {
    render(<Announcer />)
    act(() => announce('Link copied'))
    const first = screen.getByRole('status').firstChild
    act(() => announce('Link copied'))
    expect(screen.getByRole('status').firstChild).not.toBe(first)
    expect(screen.getByRole('status').textContent).toBe('Link copied')
  })
})
