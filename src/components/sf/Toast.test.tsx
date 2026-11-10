// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from './Button'
import { ToastProvider, ToastRegion, useToast } from './Toast'

afterEach(cleanup)

function DeleteWithUndo({ undo }: { undo: () => Promise<unknown> }) {
  const show = useToast()
  return (
    <>
      <Button onClick={() => show({ message: 'Message deleted', action: { label: 'Undo', pendingLabel: 'Undoing…', onAction: undo } })}>Delete</Button>
      <ToastRegion />
    </>
  )
}

describe('Toast with an Undo that may fail (UX Phase 6)', () => {
  it('says "Undoing…" while it runs, and a failure stays in the same toast, near the Undo pressed', async () => {
    let fail: (e: Error) => void = () => {}
    render(
      <ToastProvider>
        <DeleteWithUndo undo={() => new Promise((_, reject) => (fail = reject))} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: 'Undoing…' })).toBeTruthy()
    await act(async () => fail(new Error('Too late to undo.')))
    const region = screen.getByRole('status')
    expect(region.textContent).toContain('Too late to undo.')
    expect(region.textContent).not.toContain('Message deleted')
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(1)
    // The Undo pressed is gone: focus goes to Dismiss, not to the page (UX Phase 6, final review).
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss' }))
  })

  it('an older Undo that finishes doesn’t close a newer toast (UX Phase 6, final review)', async () => {
    let done: () => void = () => {}
    render(
      <ToastProvider>
        <DeleteWithUndo undo={() => new Promise<void>((resolve) => (done = resolve))} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(async () => done())
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
  })

  it('an Undo that works closes the toast', async () => {
    render(
      <ToastProvider>
        <DeleteWithUndo undo={() => Promise.resolve()} />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Undo' })))
    expect(screen.getByRole('status').textContent).toBe('')
  })
})
