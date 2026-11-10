// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileViewer } from './FileViewer'

afterEach(cleanup)

describe('FileViewer Download (slice 2: the audit log notes downloads)', () => {
  it('each Download, the bar’s or the card’s for a file it can’t show, reports the file shown; closing doesn’t', () => {
    const onDownload = vi.fn()
    const onClose = vi.fn()
    render(<FileViewer files={[{ name: 'notes.bin', url: 'blob:http://localhost/x' }]} onClose={onClose} onDownload={onDownload} />)
    const links = screen.getAllByRole('link', { name: 'Download' })
    expect(links).toHaveLength(2)
    for (const link of links) {
      link.addEventListener('click', (e) => e.preventDefault())
      fireEvent.click(link)
    }
    expect(onDownload.mock.calls).toEqual([[0], [0]])
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onDownload).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('FileViewer controls (UX Phase 3, 3.7: icon buttons have a title)', () => {
  it('Close, Previous, Next and the zoom buttons say what they do on hover', () => {
    render(
      <FileViewer
        files={[
          { name: 'a.png', url: 'blob:http://localhost/a' },
          { name: 'b.png', url: 'blob:http://localhost/b' },
        ]}
        onClose={() => {}}
      />,
    )
    for (const name of ['Close', 'Next file', 'Zoom in', 'Zoom out']) expect(screen.getByRole('button', { name }).getAttribute('title')).toBe(name)
  })
})

describe('FileViewer size (UX Phase 3, 3.7: one file-size helper)', () => {
  it('a file under half a kilobyte says 1 KB, like everywhere else', () => {
    render(<FileViewer files={[{ name: 'notes.bin', url: 'blob:http://localhost/x', sizeKb: 0 }]} onClose={() => {}} />)
    expect(screen.getByText('1 KB')).toBeTruthy()
  })
})

describe('FileViewer is a real dialog (UX Phase 5A, 5.5)', () => {
  const files = [
    { name: 'a.png', url: 'blob:http://localhost/a' },
    { name: 'b.png', url: 'blob:http://localhost/b' },
  ]
  function Opener() {
    const [open, setOpen] = useState(false)
    return (
      <main>
        <h1>Files</h1>
        <button onClick={() => setOpen(true)}>Open a.png</button>
        {open && <FileViewer files={files} onClose={() => setOpen(false)} />}
      </main>
    )
  }

  it('takes focus on open, keeps Tab inside, steps with → and gives focus back on Esc', () => {
    render(<Opener />)
    const opener = screen.getByRole('button', { name: 'Open a.png' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'a.png' })
    expect(document.activeElement).toBe(dialog)
    const items = [...dialog.querySelectorAll<HTMLElement>('a[href], button')]
    items.at(-1)!.focus()
    fireEvent.keyDown(items.at(-1)!, { key: 'Tab' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(screen.getByText('2 of 2')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
