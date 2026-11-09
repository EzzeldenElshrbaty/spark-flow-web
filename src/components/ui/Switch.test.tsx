// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

// UX Phase 3 (3.1): an on/off switch in the kit look, for Preferences and any settings page.

afterEach(cleanup)

describe('Switch', () => {
  it('is a switch named by its words, that says whether it is on and flips on click', () => {
    const onChange = vi.fn()
    render(
      <>
        <span id="push">Mobile push</span>
        <Switch checked={false} onChange={onChange} labelledBy="push" />
      </>,
    )
    const toggle = screen.getByRole('switch', { name: 'Mobile push' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
    expect(toggle.tagName).toBe('BUTTON')
  })

  it('on is brand red, off is the strong surface; the thumb is the surface; a brand focus ring', () => {
    render(
      <>
        <Switch checked onChange={() => {}} label="On" />
        <Switch checked={false} onChange={() => {}} label="Off" />
      </>,
    )
    expect(screen.getByRole('switch', { name: 'On' }).className).toContain('bg-brand-500')
    expect(screen.getByRole('switch', { name: 'Off' }).className).toContain('bg-surface-strong')
    expect(screen.getByRole('switch', { name: 'On' }).className).toContain('focus-visible:outline-brand-500')
    expect(screen.getByRole('switch', { name: 'On' }).className).toContain('dark:focus-visible:outline-brand-400')
    expect(screen.getByRole('switch', { name: 'On' }).querySelector('span')!.className).toContain('bg-surface')
  })
})
