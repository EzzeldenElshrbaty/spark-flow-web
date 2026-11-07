// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, Project, TaskView } from '@/api/types'
import { textBody } from '@/lib/messageBody'
import { TaskSheet } from './TaskSheet'

const create = { mutate: vi.fn(), isPending: false, error: null }
const update = { mutate: vi.fn(), isPending: false, error: null }
const upload = vi.fn<(projectId: string, file: File) => Promise<Attachment>>()
let manages = true

vi.mock('@/api/tickets', () => ({ useCreateTask: () => create, useUpdateTask: () => update }))
vi.mock('@/api/files', () => ({ uploadTaskFile: (projectId: string, file: File) => upload(projectId, file) }))
// The editor itself is tested in the browser; here it's a stand-in that hands files over and records what it's told.
const editor = vi.hoisted(() => ({ insertFile: vi.fn(), removeFile: vi.fn() }))
vi.mock('./description/DescriptionEditor', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    default: forwardRef(function Stub(props: { onFiles: (files: File[]) => void }, ref) {
      useImperativeHandle(ref, () => editor)
      return (
        <button type="button" onClick={() => props.onFiles([new File(['%PDF'], 'pasted.pdf', { type: 'application/pdf' })])}>
          Paste a file
        </button>
      )
    }),
  }
})
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (action: string) => manages || action === 'task.updateOwnStatus' }))

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

beforeEach(() => {
  manages = true
  create.mutate.mockReset()
  update.mutate.mockReset()
  upload.mockReset()
  editor.insertFile.mockReset()
  editor.removeFile.mockReset()
})
afterEach(cleanup)

const project = { id: 'p-nex', key: 'NEX', name: 'Nexus Core', methodology: 'waterfall', managerId: 'u-2', memberIds: [], teamIds: [] } as unknown as Project
const att = (id: string, title = `${id}.pdf`) => ({ id, title, name: title, size: 2048, mimeType: 'application/pdf', scanStatus: 'clean' }) as Attachment
const task = (files: Attachment[] = []) =>
  ({
    key: 'NEX-1', projectId: 'p-nex', title: 'Login', description: 'Steps', descriptionBody: textBody('Steps'), type: 'task', phaseId: null, status: 'todo', priority: 'medium',
    assigneeId: null, dueAt: null, estimateHours: null, sprintId: null, attachmentIds: files.map((f) => f.id), attachments: files,
  }) as unknown as TaskView

const open = (t?: TaskView, onClose = vi.fn()) => {
  render(<TaskSheet project={project} phases={[]} sprints={[]} users={[]} task={t} onClose={onClose} />)
  return onClose
}
const pick = (...names: string[]) =>
  act(async () => {
    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: names.map((n) => new File(['%PDF'], n, { type: 'application/pdf' })) } })
  })
const save = () => fireEvent.click(screen.getByRole('button', { name: /Save task/ }))

describe('TaskSheet attachments', () => {
  it('Save waits while a file uploads', async () => {
    upload.mockReturnValue(new Promise(() => {}))
    open()
    await pick('a.pdf')
    expect((screen.getByRole('button', { name: /Save task/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Wait for the files to finish uploading.')).toBeTruthy()
  })

  it('a new task sends its files in the order added', async () => {
    upload.mockResolvedValueOnce(att('a1')).mockResolvedValueOnce(att('a2'))
    open()
    fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'New' } })
    await pick('a.pdf', 'b.pdf')
    await waitFor(() => expect(screen.getByText('a2.pdf')).toBeTruthy())
    save()
    expect(create.mutate).toHaveBeenCalledWith(expect.objectContaining({ attachmentIds: ['a1', 'a2'] }), expect.anything())
  })

  it('a failed upload adds nothing', async () => {
    upload.mockRejectedValueOnce(new Error('Files can be up to 25 MB.'))
    open()
    fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'New' } })
    await pick('a.pdf')
    await waitFor(() => expect(screen.getByText('Files can be up to 25 MB.')).toBeTruthy())
    save()
    expect(create.mutate).toHaveBeenCalledWith(expect.objectContaining({ attachmentIds: [] }), expect.anything())
  })

  it('removing a file sends the shorter list; an untouched edit sends nothing', async () => {
    const onClose = open(task([att('f1'), att('f2')]))
    save()
    expect(update.mutate).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove f1.pdf' }))
    save()
    expect(update.mutate).toHaveBeenCalledWith({ key: 'NEX-1', patch: { attachmentIds: ['f2'] } }, expect.anything())
  })

  it('someone who only moves the status sees the files read-only', () => {
    manages = false
    open(task([att('f1')]))
    expect(screen.getByText('f1.pdf')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove f1.pdf' })).toBeNull()
    expect(document.querySelector('input[type=file]')).toBeNull()
  })
})

describe('TaskSheet description files', () => {
  it('a file added in the description goes in it once uploaded; removing an attachment takes it out', async () => {
    upload.mockResolvedValueOnce(att('p1', 'pasted.pdf'))
    open(task([att('f1')]))
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Paste a file' })))
    await waitFor(() => expect(editor.insertFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' })))
    fireEvent.click(screen.getByRole('button', { name: 'Remove f1.pdf' }))
    expect(editor.removeFile).toHaveBeenCalledWith('f1')
  })

  it('a file added under Attachments stays out of the description', async () => {
    upload.mockResolvedValueOnce(att('a1'))
    open()
    await pick('a.pdf')
    await waitFor(() => expect(screen.getByText('a1.pdf')).toBeTruthy())
    expect(editor.insertFile).not.toHaveBeenCalled()
  })
})
