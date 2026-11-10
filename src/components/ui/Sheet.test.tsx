// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
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


describe('a sheet keeps focus and gives it back (UX Phase 5A, 5.5)', () => {
  function Opener({ portaled = false }: { portaled?: boolean }) {
    const [open, setOpen] = useState(false)
    const [opener, setOpener] = useState(true)
    return (
      <main>
        <h1>Projects</h1>
        {opener && <button onClick={() => setOpen(true)}>New project</button>}
        {open && (
          <Sheet open title="New project" onClose={() => setOpen(false)} footer={<><SheetCancelButton /><button>Save</button></>}>
            <input aria-label="Name" />
            <button onClick={() => setOpener(false)}>Remove opener</button>
            {portaled && createPortal(<button>Picker day</button>, document.body)}
          </Sheet>
        )}
      </main>
    )
  }

  it('Tab from the last control goes to the first (the ✕), and Shift+Tab from the first goes to the last', () => {
    render(<Opener />)
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    const save = screen.getByRole('button', { name: 'Save' })
    save.focus()
    fireEvent.keyDown(save, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(save)
  })

  it('gives focus back to what opened it on Cancel', () => {
    render(<Opener />)
    const opener = screen.getByRole('button', { name: 'New project' })
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(opener)
  })

  it('puts focus on the page’s heading when what opened it is gone', () => {
    render(<Opener />)
    const opener = screen.getByRole('button', { name: 'New project' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole('button', { name: 'Remove opener' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Projects' }))
  })

  it('leaves Tab alone in something portaled out of the sheet (a picker), which handles its own keys', () => {
    render(<Opener portaled />)
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    const day = screen.getByRole('button', { name: 'Picker day' })
    day.focus()
    expect(fireEvent.keyDown(day, { key: 'Tab' })).toBe(true)
  })
})

describe('stacked sheets and odd openers (final review)', () => {
  it('a sheet that closes after another opened over it leaves focus in the one still open', () => {
    function Users() {
      const [person, setPerson] = useState(false)
      const [deactivating, setDeactivating] = useState(false)
      return (
        <main>
          <h1>Users</h1>
          <button onClick={() => setPerson(true)}>Nour</button>
          {person && (
            <Sheet open title="Edit person" onClose={() => setPerson(false)} footer={<SheetCancelButton />}>
              <button onClick={() => setDeactivating(true)}>Deactivate</button>
              <button onClick={() => setPerson(false)}>Close behind</button>
            </Sheet>
          )}
          {deactivating && (
            <Sheet open title="Deactivate Nour?" onClose={() => setDeactivating(false)} footer={<SheetCancelButton />}>
              <input aria-label="Reason" />
            </Sheet>
          )}
        </main>
      )
    }
    render(<Users />)
    const nour = screen.getByRole('button', { name: 'Nour' })
    nour.focus()
    fireEvent.click(nour)
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Reason' }))
    // The person sheet closes in a later step (a router change), while Deactivate is open.
    fireEvent.click(screen.getByRole('button', { name: 'Close behind' }))
    expect(screen.getByRole('dialog', { name: 'Deactivate Nour?' }).contains(document.activeElement)).toBe(true)
  })

  it('when what opened a sheet is gone and another sheet is still open, focus goes into that sheet, not the page behind', () => {
    function Phases() {
      const [deleting, setDeleting] = useState(false)
      return (
        <main>
          <h1>Nexus Core</h1>
          <Sheet open title="Manage phases" onClose={() => {}} footer={<SheetCancelButton />}>
            <input aria-label="Phase name" />
            {!deleting && <button onClick={() => setDeleting(true)}>Delete Design</button>}
          </Sheet>
          {deleting && (
            <Sheet open title="Delete Design?" onClose={() => setDeleting(false)} footer={<SheetCancelButton />}>
              <input aria-label="Type Design" />
            </Sheet>
          )}
        </main>
      )
    }
    render(<Phases />)
    const del = screen.getByRole('button', { name: 'Delete Design' })
    del.focus()
    fireEvent.click(del)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Delete Design?' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog', { name: 'Manage phases' }).contains(document.activeElement)).toBe(true)
  })

  it('a sheet open as the page loads (focus on the page itself) closes to the page’s heading, not to nothing', () => {
    function Loaded() {
      const [open, setOpen] = useState(true)
      return (
        <main>
          <h1>Projects</h1>
          {open && (
            <Sheet open title="New project" onClose={() => setOpen(false)} footer={<SheetCancelButton />} focusFirstField={false}>
              <p>Form</p>
            </Sheet>
          )}
        </main>
      )
    }
    ;(document.activeElement as HTMLElement | null)?.blur()
    render(<Loaded />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Projects' }))
  })
})
