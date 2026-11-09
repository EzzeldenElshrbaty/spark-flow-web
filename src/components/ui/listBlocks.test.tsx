// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AlertTriangle } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'
import { FilterBar } from './FilterBar'
import { FilterTile } from './FilterTile'
import { SEARCH_WAIT_MS, SearchBox } from './SearchBox'

// UX Phase 4, 4.2: the kit's list pattern as shared blocks (design/04-page-patterns.md A).

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SearchBox', () => {
  it('sends the words once, after a pause, not per key', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<SearchBox label="Search tasks" placeholder="Search…" value="" onChange={onChange} />)
    const box = screen.getByRole('searchbox', { name: 'Search tasks' })
    fireEvent.change(box, { target: { value: 'l' } })
    fireEvent.change(box, { target: { value: 'lo' } })
    fireEvent.change(box, { target: { value: 'login' } })
    act(() => vi.advanceTimersByTime(SEARCH_WAIT_MS - 1))
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('login')
  })

  it('takes the address’s words back when they change from outside (Back, Clear)', () => {
    const { rerender } = render(<SearchBox label="Search tasks" value="login" onChange={() => {}} />)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('login')
    rerender(<SearchBox label="Search tasks" value="" onChange={() => {}} />)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('')
  })
})

describe('FilterTile', () => {
  it('is a pressed-or-not button with its count, a dash while counting, and a toned icon', () => {
    const onClick = vi.fn()
    const { rerender } = render(<FilterTile label="Overdue" count={3} icon={AlertTriangle} tone="red" pressed={false} onClick={onClick} />)
    const tile = screen.getByRole('button', { name: /Overdue/ })
    expect(tile.getAttribute('aria-pressed')).toBe('false')
    expect(tile.textContent).toContain('3')
    expect(tile.querySelector('svg')?.parentElement?.className).toContain('text-red-600')
    fireEvent.click(tile)
    expect(onClick).toHaveBeenCalled()
    rerender(<FilterTile label="Overdue" count={undefined} icon={AlertTriangle} tone="red" pressed onClick={onClick} disabled />)
    expect(tile.getAttribute('aria-pressed')).toBe('true')
    expect(tile.textContent).toContain('–')
    expect((tile as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('EmptyState', () => {
  it('says the sentence and clears', () => {
    const onClear = vi.fn()
    render(<EmptyState onClear={onClear}>No tasks match “zzz”.</EmptyState>)
    expect(screen.getByText('No tasks match “zzz”.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('has no Clear without something to clear', () => {
    render(<EmptyState>No tasks yet.</EmptyState>)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('FilterBar', () => {
  it('counts all of them while nothing is filtered', () => {
    render(
      <FilterBar shown={23} total={23} noun={['task', 'tasks']} active={0} onClear={() => {}}>
        <span>filters</span>
      </FilterBar>,
    )
    expect(screen.getByRole('status').textContent).toBe('23 tasks')
  })

  it('says how many of them show, and Clear filters clears', () => {
    const onClear = vi.fn()
    render(
      <FilterBar shown={6} total={23} noun={['task', 'tasks']} active={2} onClear={onClear}>
        <span>filters</span>
      </FilterBar>,
    )
    expect(screen.getByRole('status').textContent).toBe('Showing 6 of 23 tasks · Clear filters')
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('one of one is singular, and it sticks under the top bar unless told not to', () => {
    const { container, rerender } = render(
      <FilterBar shown={1} total={1} noun={['task', 'tasks']} active={0} onClear={() => {}}>
        <span>filters</span>
      </FilterBar>,
    )
    expect(screen.getByRole('status').textContent).toBe('1 task')
    expect((container.firstChild as HTMLElement).className).toContain('sticky')
    rerender(
      <FilterBar shown={1} total={1} noun={['task', 'tasks']} active={0} onClear={() => {}} sticky={false}>
        <span>filters</span>
      </FilterBar>,
    )
    expect((container.firstChild as HTMLElement).className).not.toContain('sticky')
  })
})
