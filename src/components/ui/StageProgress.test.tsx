// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StageProgress } from './StageProgress'

afterEach(cleanup)

describe('StageProgress upcoming stages (UX Phase 5B, 5.8)', () => {
  it('an upcoming stage’s words use the darker grey, at full strength', () => {
    render(<StageProgress stages={[{ id: 'a', label: 'Build' }, { id: 'b', label: 'QA', meta: 'Due 3 Oct' }]} current={0} />)
    const meta = screen.getAllByText('Due 3 Oct')[0]!
    expect(meta.className).not.toContain('opacity-75')
    expect(meta.closest('[class*="bg-surface-muted"]')?.className).toContain('text-fg-tertiary')
  })
})
