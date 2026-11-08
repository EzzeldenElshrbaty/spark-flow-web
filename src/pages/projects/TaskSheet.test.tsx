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
    default: forwardRef(function Stub(props: { onFiles: (files: File[], place: string | null) => void; onChange: (body: unknown) => void; onSubmit: () => void }, ref) {
      useImperativeHandle(ref, () => editor)
      return (
        <>
          <button type="button" onClick={() => props.onFiles([new File(['%PDF'], 'pasted.pdf', { type: 'application/pdf' })], 'k-7')}>
            Paste a file
          </button>
          {/* Undo brought a removed file's chip back into the description. */}
          <button type="button" onClick={() => props.onChange([{ type: 'p', children: [{ type: 'text', text: 'x' }] }, { type: 'file', id: 'f1' }])}>
            Undo into the description
          </button>
          <button type="button" onClick={() => props.onSubmit()}>
            Submit from the editor
          </button>
        </>
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

const sheet = (t: TaskView | undefined, onClose: () => void) => <TaskSheet project={project} phases={[]} sprints={[]} users={[]} task={t} onClose={onClose} />
const open = (t?: TaskView, onClose = vi.fn()) => {
  render(sheet(t, onClose))
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

  it('a file past the 20th is refused as it’s added, not at Save', async () => {
    upload.mockReturnValue(new Promise(() => {}))
    open(task(Array.from({ length: 19 }, (_, i) => att(`f${i}`))))
    await pick('a.pdf', 'b.pdf')
    expect(screen.getByText('b.pdf').closest('li')!.textContent).toContain('Attach up to 20 files to a task.')
    expect(upload).toHaveBeenCalledOnce()
    expect(upload.mock.calls[0]![1].name).toBe('a.pdf')
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
    await waitFor(() => expect(editor.insertFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'k-7'))
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

describe('TaskSheet review fixes', () => {
  it('a file the task no longer has never goes out in the description', async () => {
    open(task([att('f1'), att('f2')]))
    fireEvent.click(screen.getByRole('button', { name: 'Remove f1.pdf' }))
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Undo into the description' })))
    save()
    expect(update.mutate).toHaveBeenCalledWith({ key: 'NEX-1', patch: { attachmentIds: ['f2'], descriptionBody: [{ type: 'p', children: [{ type: 'text', text: 'x' }] }] } }, expect.anything())
  })

  it('a file someone else added meanwhile stays when I change the files', () => {
    const onClose = vi.fn()
    const { rerender } = render(sheet(task([att('f1')]), onClose))
    rerender(sheet(task([att('f1'), att('f2')]), onClose))
    fireEvent.click(screen.getByRole('button', { name: 'Remove f1.pdf' }))
    save()
    expect(update.mutate).toHaveBeenCalledWith({ key: 'NEX-1', patch: { attachmentIds: ['f2'] } }, expect.anything())
  })

  it('a file someone else added meanwhile is no change of mine', () => {
    const onClose = vi.fn()
    const { rerender } = render(sheet(task([att('f1')]), onClose))
    rerender(sheet(task([att('f1'), att('f2')]), onClose))
    save()
    expect(update.mutate).not.toHaveBeenCalled()
  })

  it('⌘/Ctrl+Enter while saving doesn’t save twice', async () => {
    create.isPending = true
    try {
      open()
      fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'New' } })
      await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Submit from the editor' })))
      expect(create.mutate).not.toHaveBeenCalled()
    } finally {
      create.isPending = false
    }
  })
})

describe('TaskSheet asks before discarding (UX Phase 1, 1.2)', () => {
  it('an untouched new task closes at once from Cancel', () => {
    const onClose = open()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a typed title asks "Discard this new task?"; Discard closes', () => {
    const onClose = open()
    fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'Test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard this new task?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a description change or a picked file counts as a change; an edit asks "Discard your changes?"', async () => {
    const onClose = open(task())
    fireEvent.click(screen.getByRole('button', { name: 'Undo into the description' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByText('Discard your changes?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    cleanup()
    upload.mockResolvedValue(att('f9'))
    const onClose2 = open()
    await pick('spec.pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard this new task?')).toBeTruthy()
    expect(onClose2).not.toHaveBeenCalled()
  })
})

describe('TaskSheet tells who opened it about a new task (UX Phase 1, 1.5)', () => {
  it('calls onCreated with the created task, then closes; an edit doesn’t call it', () => {
    const onCreated = vi.fn()
    const onClose = vi.fn()
    create.mutate.mockImplementation((_input, opts: { onSuccess: (t: TaskView) => void }) => opts.onSuccess({ key: 'NEX-111' } as TaskView))
    render(<TaskSheet project={project} phases={[]} sprints={[]} users={[]} onCreated={onCreated} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'New badge' } })
    save()
    expect(onCreated).toHaveBeenCalledWith({ key: 'NEX-111' })
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
    update.mutate.mockImplementation((_input, opts: { onSuccess: (t: TaskView) => void }) => opts.onSuccess(task()))
    render(<TaskSheet project={project} phases={[]} sprints={[]} users={[]} task={task()} onCreated={onCreated} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'Login v2' } })
    save()
    expect(onCreated).toHaveBeenCalledTimes(1)
  })
})
