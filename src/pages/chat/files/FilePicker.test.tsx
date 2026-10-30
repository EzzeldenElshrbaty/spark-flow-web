// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, ShareableFile } from '@/api/types'
import { FilePicker } from '@/pages/chat/files/FilePicker'

const file = (id: string, name: string): Attachment =>
  ({ id, name, title: name, description: '', mimeType: 'application/pdf', size: 188_416, createdAt: '2026-10-28T09:00:00.000Z', uploadedBy: 'u-1', scanStatus: 'clean', thumbUrl: null, previewUrl: null, deletedAt: null, snippet: null, folderId: null })
let shown: ShareableFile[] = []
const asked: (string | undefined)[] = []
vi.mock('@/api/files', () => ({
  useShareableFiles: (_ws: string, q: string) => {
    asked.push(q)
    return { data: shown.filter((s) => !q || s.file.title.includes(q)), isError: false }
  },
}))
afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const where = (s: ShareableFile) => (s.channelId === 'c-backend' ? '#backend' : 'Nexus Core')
const show = () => {
  const onAdd = vi.fn()
  render(<FilePicker workspaceId="ws-eng" where={where} onAdd={onAdd} onClose={vi.fn()} />)
  return { onAdd, dialog: within(screen.getByRole('dialog', { name: 'Add from Flow files' })) }
}

describe('Add from Flow files (spec 6.8)', () => {
  it('lists the files I may share with where they are; picks several and adds them', async () => {
    shown = [
      { file: file('a1', 'scope.pdf'), channelId: 'c-backend', projectId: null },
      { file: file('a2', 'plan.pdf'), channelId: null, projectId: 'p-nex' },
    ]
    const { onAdd, dialog } = show()
    expect(dialog.getByRole('checkbox', { name: /scope\.pdf/ }).closest('label')?.textContent).toContain('#backend')
    expect(dialog.getByRole('checkbox', { name: /plan\.pdf/ }).closest('label')?.textContent).toContain('Nexus Core')
    const add = dialog.getByRole('button', { name: 'Add files' }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
    fireEvent.click(dialog.getByRole('checkbox', { name: /scope\.pdf/ }))
    fireEvent.click(dialog.getByRole('checkbox', { name: /plan\.pdf/ }))
    expect(dialog.getByRole('button', { name: 'Add 2 files' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'Add 2 files' }))
    })
    expect(onAdd).toHaveBeenCalledWith([shown[0].file, shown[1].file])
  })

  it('searches as I type, and says when nothing matches', () => {
    shown = [{ file: file('a1', 'scope.pdf'), channelId: 'c-backend', projectId: null }]
    const { dialog } = show()
    fireEvent.change(dialog.getByRole('searchbox', { name: 'Find files' }), { target: { value: 'zzz' } })
    expect(asked.at(-1)).toBe('zzz')
    expect(dialog.getByText('No files of yours match “zzz”.')).toBeTruthy()
  })
})
