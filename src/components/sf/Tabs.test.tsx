// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tabs } from './Tabs'

afterEach(cleanup)

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'mentions', label: 'Mentions' },
] as const

describe('Tabs', () => {
  it('says whether an arrow key or a click chose, so the address can replace or add a step (UX Phase 6)', () => {
    const onChange = vi.fn()
    render(<Tabs label="Activity" tabs={[...tabs]} tab="all" onChange={onChange} panelId="panel" />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'All' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('mentions', { keys: true })
    fireEvent.click(screen.getByRole('tab', { name: 'Mentions' }))
    expect(onChange).toHaveBeenLastCalledWith('mentions')
  })
})
