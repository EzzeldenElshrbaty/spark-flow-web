// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { List } from 'lucide-react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { SegmentedControl } from './SegmentedControl'

// UX Phase 3 (3.5): one segmented control, the kit's kinds B (switch) and D (inside forms).

afterEach(cleanup)

function View({ kind }: { kind?: 'switch' | 'form' }) {
  const [value, setValue] = useState<'board' | 'list' | 'table'>('board')
  return (
    <SegmentedControl
      label="View"
      kind={kind}
      value={value}
      onChange={setValue}
      options={[
        { value: 'board', label: 'Board' },
        { value: 'list', label: 'List', icon: List, iconOnlyOnPhone: true },
        { value: 'table', label: 'Table' },
      ]}
    />
  )
}

describe('SegmentedControl', () => {
  it('is a radio group named by its label, with one tab stop on the chosen option', () => {
    render(<View />)
    const group = screen.getByRole('radiogroup', { name: 'View' })
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1])
    expect(group.className).toContain('bg-surface-muted p-0.5 ring-1 ring-line')
    expect(radios[0]!.className).toContain('bg-surface text-fg shadow-sm ring-1 ring-line')
    expect(screen.getByRole('radio', { name: 'List' }).querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('a click chooses; arrow keys move and choose, wrapping', () => {
    render(<View />)
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }))
    expect(screen.getByRole('radio', { name: 'Table' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Table' }), { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'Board' }).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Board' }))
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Board' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('radio', { name: 'Table' }).getAttribute('aria-checked')).toBe('true')
  })

  it('inside a form it is the bordered kind with a muted choice', () => {
    render(<View kind="form" />)
    expect(screen.getByRole('radiogroup', { name: 'View' }).className).toContain('rounded-lg border border-line p-0.5')
    expect(screen.getByRole('radio', { name: 'Board' }).className).toContain('bg-surface-muted font-medium text-fg')
  })
})
