// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
