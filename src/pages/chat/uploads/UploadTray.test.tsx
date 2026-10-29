// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@/api/types'
import { UploadTray } from '@/pages/chat/uploads/UploadTray'
import type { Upload } from '@/pages/chat/uploads/useUploads'

afterEach(cleanup)
URL.createObjectURL ??= () => 'blob:x'
URL.revokeObjectURL ??= () => {}

const item = (name: string, over: Partial<Upload> = {}): Upload => ({
  key: name, file: new File(['x'.repeat(2048)], name, { type: 'application/pdf' }), status: 'uploading', progress: 0.4, uploaded: null, error: null, retryable: true, ...over,
})

describe('UploadTray (spec 6.9 pending tray)', () => {
  it('a card per file: its name, a progress bar while it goes up, then its type and size; × removes it', () => {
    const onRemove = vi.fn()
    render(<UploadTray uploads={[item('scope.pdf'), item('notes.pdf', { status: 'ready', progress: 1, uploaded: { id: 'a1' } as Attachment })]} refused={[]} onRemove={onRemove} onRetry={vi.fn()} />)
    const cards = within(screen.getByRole('list', { name: 'Files to send' })).getAllByRole('listitem')
    expect(cards[0].textContent).toContain('scope.pdf')
    const bar = within(cards[0]).getByRole('progressbar', { name: 'Uploading scope.pdf' })
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    expect(cards[1].textContent).toContain('PDF · 2 KB')
    expect(within(cards[1]).queryByRole('progressbar')).toBeNull()
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Remove scope.pdf' }))
    expect(onRemove).toHaveBeenCalledWith('scope.pdf')
  })

  it('a failed card says why, with Retry; refusals show above the cards', () => {
    const onRetry = vi.fn()
    render(<UploadTray uploads={[item('scope.pdf', { status: 'failed', error: "Couldn't reach the server" })]} refused={["run.exe: this type of file can't be added."]} onRemove={vi.fn()} onRetry={onRetry} />)
    expect(screen.getByRole('alert').textContent).toBe("run.exe: this type of file can't be added.")
    const card = screen.getByRole('listitem')
    expect(card.textContent).toContain("Couldn't reach the server")
    fireEvent.click(within(card).getByRole('button', { name: 'Retry scope.pdf' }))
    expect(onRetry).toHaveBeenCalledWith('scope.pdf')
  })

  it('shows nothing when there is nothing to send or say', () => {
    const { container } = render(<UploadTray uploads={[]} refused={[]} onRemove={vi.fn()} onRetry={vi.fn()} />)
    expect(container.textContent).toBe('')
  })
})

describe('UploadTray after the slice 6 review', () => {
  it('a blocked file’s card says so, with only ×', () => {
    render(<UploadTray uploads={[item('virus.pdf', { status: 'failed', error: 'This file was blocked.', retryable: false })]} refused={[]} onRemove={vi.fn()} onRetry={vi.fn()} />)
    const card = screen.getByRole('listitem')
    expect(card.textContent).toContain('This file was blocked.')
    expect(within(card).queryByRole('button', { name: 'Retry virus.pdf' })).toBeNull()
    expect(within(card).getByRole('button', { name: 'Remove virus.pdf' })).toBeTruthy()
  })
})

describe('UploadTray tooltips (spec 10)', () => {
  it('the × says what it removes when pointed at', async () => {
    render(<UploadTray uploads={[item('scope.pdf')]} refused={[]} onRemove={vi.fn()} onRetry={vi.fn()} />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Remove scope.pdf' }))
    expect((await screen.findByRole('tooltip', { hidden: true }, { timeout: 2000 })).textContent).toBe('Remove scope.pdf')
  })
})
