// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUnsavedGuards } from '@/lib/unsavedChanges'
import { useEscapeLayer } from './layers'
import { Modal, ModalCancelButton } from './Modal'

// UX Phase 3 (3.1): chat's dialogs ask before throwing away a changed form, as the kit's Sheet does (UX Phase 1, 1.2).

afterEach(() => {
  cleanup()
  useUnsavedGuards.setState({ guards: [] })
})

function InnerLayer({ onEscape }: { onEscape: () => void }) {
  useEscapeLayer(true, onEscape)
  return <p>Suggestions</p>
}

function Form({ dirty, onClose, inner }: { dirty: boolean; onClose: () => void; inner?: () => void }) {
  return (
    <Modal open title="New channel" onClose={onClose} dirty={dirty} discardQuestion="Discard this new channel?" footer={<ModalCancelButton />}>
      <input aria-label="Name" />
      {inner && <InnerLayer onEscape={inner} />}
    </Modal>
  )
}

describe('a changed dialog asks before it closes', () => {
  it('unchanged, Cancel, × and Esc close at once', () => {
    const onClose = vi.fn()
    render(<Form dirty={false} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('changed, Cancel, × and Esc ask in the footer; Keep editing goes back to the form; Discard closes', () => {
    const onClose = vi.fn()
    render(<Form dirty onClose={onClose} />)
    for (const ask of [() => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })), () => fireEvent.click(screen.getByRole('button', { name: 'Close' })), () => fireEvent.keyDown(document, { key: 'Escape' })]) {
      ask()
      expect(screen.getByRole('status').textContent).toBe('Discard this new channel?')
      fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
      expect(screen.queryByRole('status')).toBeNull()
      // Focus stays in the dialog, so Tab can't reach the page behind it (final review).
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    }
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const discard = screen.getByRole('button', { name: 'Discard' })
    expect(discard.className).toContain('bg-sf-danger-fill')
    fireEvent.click(discard)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc with a layer open inside closes that layer only', () => {
    const onClose = vi.fn()
    const inner = vi.fn()
    // A suggestion list or menu opens after the dialog, so it's the top layer.
    const { rerender } = render(<Form dirty onClose={onClose} />)
    rerender(<Form dirty onClose={onClose} inner={inner} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('joins the unsaved guards while changed, as a sheet guard: Back asks once, and Discard closes it where it is', () => {
    const onClose = vi.fn()
    const { rerender } = render(<Form dirty={false} onClose={onClose} />)
    expect(useUnsavedGuards.getState().guards).toHaveLength(0)
    rerender(<Form dirty onClose={onClose} />)
    expect(useUnsavedGuards.getState().guards).toHaveLength(1)
    const [guard] = useUnsavedGuards.getState().guards
    expect(guard?.scope).toBe('sheet')
    const leave = vi.fn()
    const stay = vi.fn()
    act(() => guard!.ask(leave, stay))
    expect(screen.getAllByRole('status')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(stay).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(leave).not.toHaveBeenCalled()
  })
})
