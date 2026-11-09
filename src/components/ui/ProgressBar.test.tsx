// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProgressBar } from './ProgressBar'

// UX Phase 3 (3.3): red means act or late, so a bar on time is grey.

afterEach(cleanup)

describe('ProgressBar tones', () => {
  it('neutral is grey, danger red, success green', () => {
    render(
      <>
        <ProgressBar value={20} tone="neutral" />
        <ProgressBar value={20} tone="danger" />
        <ProgressBar value={100} tone="success" />
      </>,
    )
    const fills = screen.getAllByRole('progressbar').map((bar) => bar.firstElementChild!.className)
    expect(fills[0]).toContain('bg-fg-tertiary')
    expect(fills[1]).toContain('bg-red-600')
    expect(fills[2]).toContain('bg-emerald-500')
  })
})
