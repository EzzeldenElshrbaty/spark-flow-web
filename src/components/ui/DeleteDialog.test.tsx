// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { DeleteDialog } from './DeleteDialog'

afterEach(cleanup)

describe('DeleteDialog gives focus back to what opened it (final review)', () => {
  it('starts in the field you type in, and Cancel returns to the opener', () => {
    function Row() {
      const [open, setOpen] = useState(false)
      return (
        <main>
          <h1>Archived records</h1>
          <button onClick={() => setOpen(true)}>Delete Atlas</button>
          {open && <DeleteDialog title="Delete Atlas?" description="It goes for good." confirmText="Atlas" removes={[]} onDelete={async () => {}} onClose={() => setOpen(false)} />}
        </main>
      )
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Row />
      </QueryClientProvider>,
    )
    const opener = screen.getByRole('button', { name: 'Delete Atlas' })
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement?.tagName).toBe('INPUT')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(opener)
  })
})
