// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { focusPageHeading } from './pageFocus'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('focusPageHeading (UX Phase 5A, 5.5)', () => {
  it('focuses the page’s h1 inside main, making it focusable, and returns it', () => {
    document.body.innerHTML = '<aside><h1>Not this</h1></aside><main><h1>Projects</h1></main>'
    const h1 = focusPageHeading()
    expect(h1?.textContent).toBe('Projects')
    expect(document.activeElement).toBe(h1)
    expect(h1?.getAttribute('tabindex')).toBe('-1')
  })

  it('returns null and leaves focus when the page has no heading yet', () => {
    document.body.innerHTML = '<main><p>Loading</p></main>'
    expect(focusPageHeading()).toBeNull()
    expect(document.activeElement).toBe(document.body)
  })
})
