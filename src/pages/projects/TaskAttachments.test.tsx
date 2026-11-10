// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@/api/types'
import { allowedFilesHint, allowedFilesShort } from '@/lib/fileTypes'
import { TaskAttachments } from './TaskAttachments'
import type { UploadRow } from './uploadQueue'

afterEach(cleanup)

const file = (id: string, title: string, size: number) => ({ id, title, name: title, size, mimeType: 'application/pdf' }) as Attachment
const handlers = () => ({ onAdd: vi.fn(), onRemove: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn(), onDismiss: vi.fn(), canRetry: () => true })

describe('TaskAttachments', () => {
  it('lists files and uploads; × removes; a failed upload offers Try again and dismiss', () => {
    const h = handlers()
    const rows: UploadRow[] = [
      { id: 'up-1', name: 'b.png', state: 'uploading', error: null, progress: 0.5 },
      { id: 'up-2', name: 'c.zip', state: 'failed', error: 'Files can be up to 25 MB.' },
    ]
    render(<TaskAttachments files={[file('a1', 'flow.pdf', 1_258_291)]} rows={rows} readOnly={false} {...h} />)
    expect(screen.getByText('Attachments')).toBeTruthy()
    expect(screen.getByText('flow.pdf')).toBeTruthy()
    expect(screen.getByText('1.2 MB')).toBeTruthy()
    expect(screen.getByText('Uploading… 50%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove flow.pdf' }))
    expect(h.onRemove).toHaveBeenCalledWith('a1')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.onCancel).toHaveBeenCalledWith('up-1')
    expect(screen.getByText('Files can be up to 25 MB.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(h.onRetry).toHaveBeenCalledWith('up-2')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss c.zip' }))
    expect(h.onDismiss).toHaveBeenCalledWith('up-2')
  })

  it('its icons are hidden from screen readers: the names and buttons say it all', () => {
    const rows: UploadRow[] = [{ id: 'up-1', name: 'b.png', state: 'uploading', error: null }]
    const { container } = render(<TaskAttachments files={[file('a1', 'flow.pdf', 1024)]} rows={rows} readOnly={false} {...handlers()} />)
    const icons = [...container.querySelectorAll('svg')]
    expect(icons.length).toBeGreaterThan(0)
    expect(icons.filter((svg) => svg.getAttribute('aria-hidden') !== 'true').map((svg) => svg.getAttribute('class'))).toEqual([])
  })

  it('takes files dropped on its box or picked', () => {
    const h = handlers()
    const { container } = render(<TaskAttachments files={[]} rows={[]} readOnly={false} {...h} />)
    expect(container.textContent).toContain('Add files or drop them here')
    // UX Phase 4, 4.9: one short line; the full list behind "Which files?".
    expect(screen.queryByText(`${allowedFilesHint}.`)).toBeNull()
    const which = screen.getByRole('button', { name: 'Which files?' })
    expect(which.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(which)
    expect(which.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(`${allowedFilesHint}.`)).toBeTruthy()
    const picked = [new File(['x'], 'a.pdf', { type: 'application/pdf' })]
    fireEvent.drop(screen.getByText(allowedFilesShort).parentElement!, { dataTransfer: { files: picked } })
    expect(h.onAdd).toHaveBeenCalledWith(picked)
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: picked } })
    expect(h.onAdd).toHaveBeenCalledTimes(2)
  })

  it('its file input is hidden from screen readers; Add files is the way in (UX Phase 5A, 5.9)', () => {
    const { container } = render(<TaskAttachments files={[]} rows={[]} readOnly={false} {...handlers()} />)
    expect(container.querySelector('input[type=file]')?.hasAttribute('hidden')).toBe(true)
  })

  it('an uploading row is a named progress bar, not a live region; the notice is read once (UX Phase 5A, 5.12)', () => {
    const rows: UploadRow[] = [{ id: 'up-1', name: 'a.pdf', state: 'uploading', error: null, progress: 0.5 }]
    const { container } = render(<TaskAttachments files={[]} rows={rows} readOnly={false} notice="b.pdf uploaded." {...handlers()} />)
    expect(screen.getByRole('progressbar', { name: 'Uploading a.pdf' }).getAttribute('aria-valuenow')).toBe('50')
    expect(container.querySelector('[aria-live]')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('b.pdf uploaded.')
  })

  it('read-only shows the files without remove or add', () => {
    const { container } = render(<TaskAttachments files={[file('a1', 'flow.pdf', 2048)]} rows={[]} readOnly {...handlers()} />)
    expect(screen.getByText('flow.pdf')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove flow.pdf' })).toBeNull()
    expect(container.querySelector('input[type=file]')).toBeNull()
  })
})
