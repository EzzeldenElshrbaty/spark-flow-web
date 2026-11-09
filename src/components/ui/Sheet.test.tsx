// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUnsavedGuards } from '@/lib/unsavedChanges'
import { Sheet, SheetCancelButton } from './Sheet'

afterEach(() => {
  cleanup()
  useUnsavedGuards.setState({ guards: [] })
})

function Form({ dirty, onClose, question }: { dirty: boolean; onClose: () => void; question?: string }) {
  return (
    <Sheet open title="New task" onClose={onClose} dirty={dirty} discardQuestion={question} footer={<SheetCancelButton />}>
      <input aria-label="Title" />
    </Sheet>
  )
}

describe('a changed sheet asks before it closes (UX Phase 1, 1.2)', () => {
  it('closes at once when nothing changed, from ✕ and from Cancel', () => {
    const onClose = vi.fn()
    render(<Form dirty={false} onClose={onClose} />)
    // Its ✕ says what it does on hover (UX Phase 3, 3.7).
    expect(screen.getByRole('button', { name: 'Close' }).getAttribute('title')).toBe('Close')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('asks "Discard your changes?" from ✕ when changed; Keep editing stays, Discard closes', () => {
    const onClose = vi.fn()
    render(<Form dirty onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByText('Discard your changes?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByText('Discard your changes?')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('asks its own question', () => {
    render(<Form dirty onClose={() => {}} question="Discard this new task?" />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard this new task?')).toBeTruthy()
  })

  it('joins the unsaved guards while changed, as a sheet guard; Back asks, and Discard closes the sheet where it is', () => {
    const onClose = vi.fn()
    const { rerender } = render(<Form dirty={false} onClose={onClose} />)
    expect(useUnsavedGuards.getState().guards).toHaveLength(0)
    rerender(<Form dirty onClose={onClose} />)
    const [guard] = useUnsavedGuards.getState().guards
    expect(guard?.scope).toBe('sheet')
    const leave = vi.fn()
    const stay = vi.fn()
    // Back: the blocker hands the guard its way on and its way back.
    act(() => guard!.ask(leave, stay))
    expect(screen.getByText('Discard your changes?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    // Focus stays in the sheet, so Tab can't reach the page behind it (UX Phase 3 final review).
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    expect(stay).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    act(() => guard!.ask(leave, stay))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    // Back closes the sheet first: the page stays, the next Back leaves it.
    expect(stay).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(leave).not.toHaveBeenCalled()
  })
})

