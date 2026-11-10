// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useRestoreFocus } from './layers'

afterEach(cleanup)

/** A layer that moves focus into itself as it opens, as Sheet and Modal do. */
function Layer({ onClose }: { onClose: () => void }) {
  useRestoreFocus(true)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    field.current?.focus()
  }, [])
  return (
    <div role="dialog" aria-label="Layer">
      <input ref={field} aria-label="Field" />
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

function Page() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && <Layer onClose={() => setOpen(false)} />}
    </>
  )
}

describe('useRestoreFocus', () => {
  it('gives focus back to the opener under StrictMode (its effects run twice as the layer opens)', async () => {
    render(
      <StrictMode>
        <Page />
      </StrictMode>,
    )
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Field' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await act(async () => {})
    expect(document.activeElement).toBe(opener)
  })
})
