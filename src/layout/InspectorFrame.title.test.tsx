// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { InspectorFrame, TitleSkeleton } from './InspectorFrame'

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

describe('the panel’s focus waits for its title (UX Phase 6, deferred minor #31)', () => {
  it('doesn’t focus the skeleton; focuses the title once it loads', async () => {
    const frame = (title: React.ReactNode) => (
      <InspectorFrame label="Task" title={title} onClose={() => {}} focusTitle>
        <p>Body</p>
      </InspectorFrame>
    )
    const { rerender } = render(frame(<TitleSkeleton />))
    await act(async () => {})
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { level: 2 }))
    rerender(frame('Rotate refresh tokens'))
    await act(async () => {})
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Rotate refresh tokens' }))
  })
})
