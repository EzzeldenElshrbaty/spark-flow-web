// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, ProjectSummary, TaskView } from '@/api/types'
import { AddTaskDialog } from './AddTaskDialog'

const announced = vi.hoisted(() => vi.fn())
vi.mock('@/components/sf/Announcer', async (original) => ({ ...(await original<typeof import('@/components/sf/Announcer')>()), announce: announced }))

const nexus = { id: 'p-nex', key: 'NEX', name: 'Nexus Core', workspaceId: 'ws-eng', archivedAt: null } as ProjectSummary
const task = (key: string, title: string, assigneeId: string | null, category: TaskView['category'] = 'todo') =>
  ({ id: `t-${key.toLowerCase()}`, key, title, assigneeId, category, status: 'todo', projectId: 'p-nex' }) as TaskView
const tasks = [
  task('NEX-105', 'Board: drag a card to change its status', 'u-3'),
  task('NEX-106', 'Show an unread badge in the channel list', 'u-3'),
  task('NEX-104', 'Add an index on messages (channel_id, created_at)', 'u-3', 'done'),
  task('NEX-109', 'Export the ticket list to CSV', null),
]
const add = { mutate: vi.fn(), isPending: false }
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [nexus] }) }))
vi.mock('@/api/tickets', () => ({ useTasksOf: () => ({ data: tasks }) }))
vi.mock('@/api/taskLists', () => ({
  useTaskList: () => ({ data: { channelId: 'c-frontend', entries: [{ id: 'ct-1', addedBy: 'u-3', addedAt: '', task: { id: 't-nex-106', key: 'NEX-106' } }] } }),
  useAddToTaskList: () => add,
}))

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
beforeEach(() => {
  add.mutate.mockReset()
  announced.mockReset()
})
afterEach(cleanup)

const channel = { id: 'c-frontend', workspaceId: 'ws-eng', kind: 'channel', name: 'frontend-dev' } as Channel
const open = (onClose = vi.fn()) => {
  render(<AddTaskDialog channel={channel} me="u-3" onClose={onClose} />)
  return { dialog: screen.getByRole('dialog', { name: 'Add an existing task' }), onClose }
}
const search = (words: string) => fireEvent.change(screen.getByRole('searchbox', { name: 'Find a task' }), { target: { value: words } })
const result = (key: string) => screen.getByRole('button', { name: new RegExp(`^${key} `) })

describe('Add an existing task (task list §6)', () => {
  it('starts with my open tasks, the one already on the list marked', () => {
    const { dialog } = open()
    expect((screen.getByRole('searchbox', { name: 'Find a task' }) as HTMLInputElement).placeholder).toBe('Key or title')
    const mine = within(dialog).getByRole('list', { name: 'Assigned to you' })
    expect(within(mine).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toHaveLength(2)
    expect(result('NEX-106').getAttribute('aria-disabled')).toBe('true')
    expect(result('NEX-106').getAttribute('aria-label')).toBe('NEX-106 Show an unread badge in the channel list · On the list')
    expect(screen.queryByRole('button', { name: /^NEX-104 / })).toBeNull()
  })

  it('finds tasks by the start of a word; picking one adds it, marks it and says so', () => {
    open()
    search('unread')
    fireEvent.click(result('NEX-106'))
    expect(add.mutate).not.toHaveBeenCalled()
    search('csv')
    add.mutate.mockImplementation((_input, opts: { onSuccess: () => void }) => opts.onSuccess())
    act(() => void fireEvent.click(result('NEX-109')))
    expect(add.mutate).toHaveBeenCalledWith({ channelId: 'c-frontend', taskKey: 'NEX-109' }, expect.anything())
    expect(result('NEX-109').getAttribute('aria-label')).toContain('· On the list')
    expect(announced).toHaveBeenCalledWith('NEX-109 added to the task list.')
  })

  it('says when nothing matches, and shows a refusal under the field', () => {
    open()
    search('zzz')
    expect(screen.getByText('No tasks match “zzz”.')).toBeTruthy()
    search('csv')
    add.mutate.mockImplementation((_input, opts: { onError: (e: Error) => void }) => opts.onError(new Error('A task list holds up to 200 tasks.')))
    act(() => void fireEvent.click(result('NEX-109')))
    expect(screen.getByText('A task list holds up to 200 tasks.')).toBeTruthy()
  })

  it('Done closes it', () => {
    const { onClose } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })
})
