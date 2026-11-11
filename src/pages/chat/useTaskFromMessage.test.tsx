// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, ChatMessage, ProjectSummary } from '@/api/types'
import type { TaskSheet } from '@/pages/projects/TaskSheet'
import { useTaskFromMessage } from '@/pages/chat/useTaskFromMessage'

let projects: ProjectSummary[] | undefined
const manages = new Set<string>()
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: projects }), usePhases: () => ({ data: [] }) }))
vi.mock('@/api/tickets', () => ({ useSprints: () => ({ data: [] }) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [] }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (_action: string, ctx: { project: { id: string } }) => manages.has(ctx.project.id) }))
const queue = vi.hoisted(() => ({ enqueue: vi.fn() }))
vi.mock('@/api/sendQueue', () => ({ useSendQueue: () => queue }))
// The sheet itself is tested on its own: here it only shows what it was given.
type SheetProps = Parameters<typeof TaskSheet>[0]
const shown = vi.hoisted(() => ({ props: null as SheetProps | null }))
vi.mock('@/pages/projects/TaskSheet', () => ({
  TaskSheet: (props: SheetProps) => {
    shown.props = props
    return null
  },
}))

const nexus = { id: 'p-nex', name: 'Nexus Core', channelId: 'c-p-nex', methodology: 'agile', archivedAt: null } as ProjectSummary
const mobile = { id: 'p-mob', name: 'Mobile App', channelId: 'c-p-mob', methodology: 'waterfall', archivedAt: null } as ProjectSummary
let where = ''
function Where() {
  where = useLocation().search
  return null
}
const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/w/engineering/c/c-general']}>
    {children}
    <Where />
  </MemoryRouter>
)
const inChannel = (channelId: string, listed = true) => renderHook(() => useTaskFromMessage(channelId, 'ws-eng', listed), { wrapper })

beforeEach(() => {
  projects = [nexus, mobile]
  manages.clear()
  manages.add('p-nex')
  shown.props = null
  where = ''
  queue.enqueue.mockClear()
})
afterEach(cleanup)

describe('useTaskFromMessage: /task in a project’s channel (spec 6.8)', () => {
  it('offers it for that project where I manage its tasks, with no Project field', () => {
    const { result } = inChannel('c-p-nex')
    expect(result.current.fromCommand?.projectName).toBe('Nexus Core')
    expect(result.current.whyNoTask).toBeUndefined()
    act(() => result.current.fromCommand!.open({ title: 'Fix login', assigneeId: 'u-5' }))
    render(<>{result.current.sheet}</>, { wrapper })
    expect(shown.props?.project.id).toBe('p-nex')
    expect(shown.props?.projectChoice).toBeUndefined()
    expect(shown.props?.draft).toMatchObject({ title: 'Fix login', assigneeId: 'u-5' })
    // The project's own Created card is already here: nothing more is posted.
    expect(shown.props?.onCreated).toBeUndefined()
  })

  it('where I can’t manage its tasks, names the project and offers no other', () => {
    const { result } = inChannel('c-p-mob')
    expect(result.current.fromCommand).toBeUndefined()
    expect(result.current.whyNoTask).toBe('You can’t create tasks in Mobile App.')
  })
})

describe('useTaskFromMessage: /task in a channel or DM with no project', () => {
  it('offers it with no project named, and opens the sheet on the first of my projects with a Project field', () => {
    manages.add('p-mob')
    const { result } = inChannel('c-general')
    expect(result.current.fromCommand).toBeDefined()
    expect(result.current.fromCommand?.projectName).toBeUndefined()
    expect(result.current.whyNoTask).toBeUndefined()
    act(() => result.current.fromCommand!.open({ title: 'update login', assigneeId: 'u-5' }))
    const { rerender } = render(<>{result.current.sheet}</>, { wrapper })
    expect(shown.props?.project.id).toBe('p-nex')
    expect(shown.props?.projectChoice?.projects.map((p) => p.id)).toEqual(['p-nex', 'p-mob'])
    expect(shown.props?.draft).toMatchObject({ title: 'update login', assigneeId: 'u-5' })
    // No message link: the server takes a task's message only from its project's chat.
    expect(shown.props?.draft?.linkedMessageId).toBeUndefined()
    act(() => shown.props!.projectChoice!.onPick('p-mob'))
    rerender(<>{result.current.sheet}</>)
    expect(shown.props?.project.id).toBe('p-mob')
  })

  it('opens the new task in the panel beside the chat', () => {
    const { result } = inChannel('c-general')
    act(() => result.current.fromCommand!.open({ title: 'update login', assigneeId: null }))
    render(<>{result.current.sheet}</>, { wrapper })
    act(() => shown.props!.onCreated!({ key: 'NEX-112' } as never))
    expect(where).toContain('ticket=NEX-112')
  })

  it('says "Created NEX-112" in this channel, as me, so it shows the task’s card here too', () => {
    const { result } = inChannel('c-general')
    act(() => result.current.fromCommand!.open({ title: 'update login', assigneeId: null }))
    render(<>{result.current.sheet}</>, { wrapper })
    act(() => shown.props!.onCreated!({ key: 'NEX-112' } as never))
    expect(queue.enqueue).toHaveBeenCalledTimes(1)
    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'c-general',
        body: [{ type: 'p', children: [{ type: 'text', text: 'Created ' }, { type: 'task', key: 'NEX-112' }] }],
        content: 'Created NEX-112',
      }),
    )
  })

  it('with no project I may add tasks to, says so; while the projects load, says nothing', () => {
    manages.clear()
    expect(inChannel('c-general').result.current.whyNoTask).toBe('/task needs a project you can add tasks to.')
    expect(inChannel('c-general').result.current.fromCommand).toBeUndefined()
    projects = undefined
    expect(inChannel('c-general').result.current.whyNoTask).toBeUndefined()
  })
})

describe('useTaskFromMessage: tasks made in a channel join its list (task list §6, R2)', () => {
  it('in a channel, /task and Create task from a file go onto its list', () => {
    const { result } = inChannel('c-p-nex')
    act(() => result.current.fromCommand!.open({ title: 'Fix login', assigneeId: null }))
    render(<>{result.current.sheet}</>, { wrapper })
    expect(shown.props?.onto).toEqual({ channelId: 'c-p-nex' })
    cleanup()
    const again = inChannel('c-p-nex').result
    const message = { id: 'm1', channelId: 'c-p-nex', content: 'Crash on save' } as ChatMessage
    act(() => again.current.fromFile!({ title: 'crash.log' } as Attachment, message))
    render(<>{again.current.sheet}</>, { wrapper })
    expect(shown.props?.onto).toEqual({ channelId: 'c-p-nex' })
    expect(shown.props?.draft).toMatchObject({ title: 'crash.log', linkedMessageId: 'm1' })
  })

  it('in a DM, nothing goes onto a list', () => {
    const { result } = inChannel('c-dm-1', false)
    act(() => result.current.fromCommand!.open({ title: 'Fix login', assigneeId: null }))
    render(<>{result.current.sheet}</>, { wrapper })
    expect(shown.props?.onto).toBeUndefined()
  })

  it('New task from the list: an empty sheet on my first project, nothing posted and no panel', () => {
    manages.add('p-mob')
    const { result } = inChannel('c-general')
    act(() => result.current.newTask!())
    render(<>{result.current.sheet}</>, { wrapper })
    expect(shown.props?.onto).toEqual({ channelId: 'c-general' })
    expect(shown.props?.draft).toMatchObject({ title: '' })
    expect(shown.props?.projectChoice?.projects.map((p) => p.id)).toEqual(['p-nex', 'p-mob'])
    expect(shown.props?.onCreated).toBeUndefined()
  })

  it('New task is there only where /task is', () => {
    expect(inChannel('c-p-nex').result.current.newTask).toBeDefined()
    expect(inChannel('c-p-mob').result.current.newTask).toBeUndefined()
    manages.clear()
    expect(inChannel('c-general').result.current.newTask).toBeUndefined()
  })
})
