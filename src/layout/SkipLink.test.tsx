// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SkipLink } from './SkipLink'

afterEach(cleanup)

describe('Skip to content (UX Phase 5A, 5.7)', () => {
  it('is the first Tab stop, and moves focus to the page without changing the address', () => {
    render(
      <>
        <SkipLink />
        <nav>
          <a href="/projects">Projects</a>
        </nav>
        <main id="main" tabIndex={-1}>
          <h1>Dashboard</h1>
        </main>
      </>,
    )
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(document.querySelector('a[href], button, input')).toBe(skip)
    fireEvent.click(skip)
    expect(document.activeElement).toBe(screen.getByRole('main'))
    expect(window.location.hash).toBe('')
  })
})
