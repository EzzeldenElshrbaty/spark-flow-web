// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, Project, TaskView } from '@/api/types'
import { textBody } from '@/lib/messageBody'
import { TaskSheet } from './TaskSheet'

const announced = vi.hoisted(() => vi.fn())
vi.mock('@/components/sf/Announcer', async (original) => ({ ...(await original<typeof import('@/components/sf/Announcer')>()), announce: announced }))

const create = { mutate: vi.fn(), isPending: false, error: null }
const update = { mutate: vi.fn(), isPending: false, error: null }
const upload = vi.fn<(projectId: string, file: File) => Promise<Attachment>>()
let manages = true

vi.mock('@/api/tickets', () => ({ useCreateTask: () => create, useUpdateTask: () => update }))
const addNew = { mutate: vi.fn(), isPending: false, error: null }
vi.mock('@/api/taskLists', () => ({ useAddNewToTaskList: () => addNew }))
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
  addNew.mutate.mockReset()
  announced.mockReset()
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

describe('TaskSheet onto a channel’s task list (task list §6)', () => {
  it('saves through the channel’s list instead of creating it alone, and says both', () => {
    const onCreated = vi.fn()
    const onClose = vi.fn()
    addNew.mutate.mockImplementation((_input, opts: { onSuccess: (t: TaskView) => void }) => opts.onSuccess({ key: 'NEX-111' } as TaskView))
    render(<TaskSheet project={project} phases={[]} sprints={[]} users={[]} onto={{ channelId: 'c-frontend' }} onCreated={onCreated} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'New badge' } })
    save()
    expect(create.mutate).not.toHaveBeenCalled()
    expect(addNew.mutate).toHaveBeenCalledWith({ channelId: 'c-frontend', input: expect.objectContaining({ projectId: 'p-nex', title: 'New badge' }) }, expect.anything())
    expect(onCreated).toHaveBeenCalledWith({ key: 'NEX-111' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(announced).toHaveBeenCalledWith('Task NEX-111 created and added to the task list.')
  })
})

describe('TaskSheet onto a channel’s list, optionally (final review)', () => {
  it('a task made from chat joins the list only where it may, and says only that it was created', () => {
    addNew.mutate.mockImplementation((_input, opts: { onSuccess: (t: TaskView) => void }) => opts.onSuccess({ key: 'NEX-112' } as TaskView))
    render(<TaskSheet project={project} phases={[]} sprints={[]} users={[]} onto={{ channelId: 'c-p-nex', optional: true }} onClose={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'From chat' } })
    save()
    expect(addNew.mutate).toHaveBeenCalledWith({ channelId: 'c-p-nex', input: expect.objectContaining({ title: 'From chat' }), optional: true }, expect.anything())
    expect(announced).toHaveBeenCalledWith('Task NEX-112 created.')
  })
})

describe('TaskSheet checks as you fix (UX Phase 4, 4.4)', () => {
  it('the title error shows on Save, leaves once a title is typed, and Enter in the title saves', () => {
    render(<TaskSheet project={project} phases={[]} sprints={[]} users={[]} onCreated={() => {}} onClose={() => {}} />)
    const title = screen.getByRole('textbox', { name: /^Title/ })
    expect(screen.queryByText('Give the task a title.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.getByText('Give the task a title.')).toBeTruthy()
    expect(create.mutate).not.toHaveBeenCalled()
    fireEvent.change(title, { target: { value: 'Login' } })
    expect(screen.queryByText('Give the task a title.')).toBeNull()
    expect((title as HTMLInputElement).form?.querySelector('button[type="submit"]')).toBeTruthy()
    fireEvent.submit((title as HTMLInputElement).form!)
    expect(create.mutate).toHaveBeenCalledTimes(1)
  })
})

describe('TaskSheet Project field (/task in a channel with no project)', () => {
  const mobile = { id: 'p-mob', key: 'MOB', name: 'Mobile App', methodology: 'agile', managerId: 'u-2', memberIds: [], teamIds: [], currentPhaseId: 'ph-m1' } as unknown as Project
  const phases = [{ id: 'ph-n1', projectId: 'p-nex', name: 'Build', order: 1 }] as never[]
  const mobilePhases = [{ id: 'ph-m1', projectId: 'p-mob', name: 'Design', order: 1 }] as never[]
  const choice = (onPick = vi.fn()) => ({ projects: [project, mobile], onPick })
  const nour = { id: 'u-5', name: 'Nour El-Sayed', teamIds: [] } as never
  const field = (name: RegExp) => screen.getByRole('combobox', { name }) as HTMLSelectElement

  it('comes first, lists my projects and names the one picked; without a choice there is none', () => {
    render(<TaskSheet project={project} phases={phases} sprints={[]} users={[]} projectChoice={choice()} onClose={vi.fn()} />)
    const picker = field(/Project/)
    expect([...picker.options].map((o) => o.textContent)).toEqual(['Nexus Core', 'Mobile App'])
    expect(picker.value).toBe('p-nex')
    const title = screen.getByRole('textbox', { name: /Title/ })
    expect(picker.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    cleanup()
    open()
    expect(screen.queryByRole('combobox', { name: /Project/ })).toBeNull()
  })

  it('picking another project keeps what I wrote and resets status, phase and sprint, which belong to a project', () => {
    const onPick = vi.fn()
    const { rerender } = render(<TaskSheet project={project} phases={phases} sprints={[]} users={[]} projectChoice={choice(onPick)} draft={{ title: 'update login', descriptionBody: [] }} onClose={vi.fn()} />)
    fireEvent.change(field(/Priority/), { target: { value: 'high' } })
    fireEvent.change(field(/Phase/), { target: { value: 'ph-n1' } })
    fireEvent.change(field(/Project/), { target: { value: 'p-mob' } })
    expect(onPick).toHaveBeenCalledWith('p-mob')
    rerender(<TaskSheet project={mobile} phases={mobilePhases} sprints={[]} users={[]} projectChoice={choice(onPick)} draft={{ title: 'update login', descriptionBody: [] }} onClose={vi.fn()} />)
    expect((screen.getByRole('textbox', { name: /Title/ }) as HTMLInputElement).value).toBe('update login')
    expect(field(/Priority/).value).toBe('high')
    expect(field(/Phase/).value).toBe('ph-m1')
    expect(field(/Sprint/).value).toBe('')
    expect(screen.getByText('Mobile App', { selector: 'p, span, div' })).toBeTruthy()
    save()
    expect(create.mutate.mock.calls[0]![0]).toMatchObject({ projectId: 'p-mob', title: 'update login', priority: 'high', phaseId: 'ph-m1' })
  })

  it('is locked once files are attached, as they were added to the project picked', async () => {
    upload.mockResolvedValue(att('f1'))
    render(<TaskSheet project={project} phases={phases} sprints={[]} users={[]} projectChoice={choice()} onClose={vi.fn()} />)
    await pick('a.pdf')
    await waitFor(() => expect(field(/Project/).disabled).toBe(true))
    expect(screen.getByText('Take the files off to change the project.')).toBeTruthy()
  })

  it('a new task’s assignee from the draft who isn’t on the project still shows, said so', () => {
    render(<TaskSheet project={project} phases={phases} sprints={[]} users={[nour]} projectChoice={choice()} draft={{ title: 'update login', descriptionBody: [], assigneeId: 'u-5' }} onClose={vi.fn()} />)
    const assignee = field(/Assignee/)
    expect(assignee.value).toBe('u-5')
    expect(assignee.selectedOptions[0]!.textContent).toBe('Nour El-Sayed (not on this project)')
  })
})

describe('TaskSheet for screen readers (UX Phase 5A, 5.9)', () => {
  it('Save with no title puts the caret in Title, which says it’s required and why', () => {
    render(<TaskSheet project={project} phases={[]} sprints={[]} users={[]} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    const title = screen.getByRole('textbox', { name: 'Title', description: 'Give the task a title.' })
    expect(title.getAttribute('aria-required')).toBe('true')
    expect(document.activeElement).toBe(title)
  })
})

describe('a save is read out (UX Phase 5A, 5.12)', () => {
  it('"Task NEX-111 created." after the sheet closes; an edit says "Task NEX-110 saved."', () => {
    announced.mockClear()
    const onClose = vi.fn()
    create.mutate.mockImplementation((_input, opts: { onSuccess: (t: TaskView) => void }) => opts.onSuccess({ key: 'NEX-111' } as TaskView))
    render(<TaskSheet project={project} phases={[]} sprints={[]} users={[]} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'New badge' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onClose).toHaveBeenCalled()
    expect(announced).toHaveBeenLastCalledWith('Task NEX-111 created.')
    cleanup()
    update.mutate.mockImplementation((_input, opts: { onSuccess: () => void }) => opts.onSuccess())
    render(<TaskSheet project={project} phases={[]} sprints={[]} users={[]} task={task()} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Title/ }), { target: { value: 'Login v2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(announced).toHaveBeenLastCalledWith(`Task ${task().key} saved.`)
  })
})

