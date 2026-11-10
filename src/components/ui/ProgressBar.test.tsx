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
        <ProgressBar value={20} tone="neutral" label="Progress" />
        <ProgressBar value={20} tone="danger" label="Progress" />
        <ProgressBar value={100} tone="success" label="Progress" />
      </>,
    )
    const fills = screen.getAllByRole('progressbar').map((bar) => bar.firstElementChild!.className)
    expect(fills[0]).toContain('bg-fg-tertiary')
    expect(fills[1]).toContain('bg-red-600')
    expect(fills[2]).toContain('bg-emerald-500')
  })
})

describe('ProgressBar is named (UX Phase 5A, 5.11: axe "aria-progressbar-name")', () => {
  it('reads its label and value', () => {
    render(<ProgressBar value={20} label="Progress" />)
    expect(screen.getByRole('progressbar', { name: 'Progress' }).getAttribute('aria-valuenow')).toBe('20')
  })
})

