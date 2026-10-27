// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@/api/types'
import { MessageFiles } from '@/pages/chat/MessageFiles'

vi.mock('@/components/AttachmentView', async (original) => ({
  ...(await original<typeof import('@/components/AttachmentView')>()),
  useFileUrl: () => ({ url: 'blob:http://localhost/file-1', failed: false }),
}))

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const pdf: Attachment = { id: 'a1', name: 'Scope v3.pdf', mimeType: 'application/pdf', size: 188_416, createdAt: '2026-10-28T09:00:00.000Z' }
const link = 'http://localhost/w/engineering/c/c-backend?message=m1'

describe('MessageFiles (spec 6.9 file card)', () => {
  it('a file card names the file, its type and size', () => {
    render(<MessageFiles attachments={[pdf]} link={link} />)
    expect(screen.getByRole('button', { name: 'Open Scope v3.pdf' }).textContent).toContain('PDF · 184 KB')
  })

  it('has Open, Download and More, reachable from the keyboard', () => {
    render(<MessageFiles attachments={[pdf]} link={link} />)
    const actions = screen.getByRole('group', { name: 'Scope v3.pdf actions' })
    expect([...actions.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['Open', 'Download', 'More file actions'])
  })

  it('Download saves the file under its name', () => {
    const clicked: HTMLAnchorElement[] = []
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    render(<MessageFiles attachments={[pdf]} link={link} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(clicked[0].download).toBe('Scope v3.pdf')
    expect(clicked[0].href).toBe('blob:http://localhost/file-1')
    spy.mockRestore()
  })

  it('More → Copy link to file copies the message permalink and says so', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<MessageFiles attachments={[pdf]} link={link} />)
    fireEvent.click(screen.getByRole('button', { name: 'More file actions' }))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link to file' })))
    expect(writeText).toHaveBeenCalledWith(link)
    expect(screen.getByRole('status').textContent).toBe('Link copied')
  })

  it('without a link there is no More menu', () => {
    render(<MessageFiles attachments={[pdf]} />)
    expect(screen.queryByRole('button', { name: 'More file actions' })).toBeNull()
  })
})
