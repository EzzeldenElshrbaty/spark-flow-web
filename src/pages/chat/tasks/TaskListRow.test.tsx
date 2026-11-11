// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskListEntry } from '@/api/types'
import { TaskListRow } from './TaskListRow'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
afterEach(cleanup)

const entry = (key: string, over: Partial<TaskListEntry['task']> = {}): TaskListEntry => ({
  id: `ct-${key}`, addedBy: 'u-3', addedAt: '2026-11-01T10:00:00.000Z',
  task: { id: key, key, title: `Title of ${key}`, status: 'todo', statusLabel: 'To do', category: 'todo', projectKey: 'NEX', projectName: 'Nexus Core', assigneeId: 'u-3', projectId: 'p-nex', dueAt: null, overdue: false, ...over },
})
const CANT = 'Only the project’s manager or the task’s assignee can change its status.'
const row = (props: Partial<Parameters<typeof TaskListRow>[0]> & { entry: TaskListEntry }) =>
  render(
    <MemoryRouter>
      <ul>
        <TaskListRow assignee="Mariam Fathy" showProject={false} cantTick={null} saving={false} error={null} link="?ticket=X" onTick={vi.fn()} onOpen={vi.fn()} {...props} />
      </ul>
    </MemoryRouter>,
  )

describe('a task list row (task list §5)', () => {
  it('names its checkbox by what ticking does, and ticking says which way', () => {
    const onTick = vi.fn()
    row({ entry: entry('MOB-103', { projectKey: 'MOB' }), onTick })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark MOB-103 done' }))
    expect(onTick).toHaveBeenCalledWith(true)
    cleanup()
    row({ entry: entry('NEX-103', { category: 'done', statusLabel: 'Done' }), onTick })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reopen NEX-103' }))
    expect(onTick).toHaveBeenLastCalledWith(false)
  })

  it('reads a late due date as late', () => {
    row({ entry: entry('MOB-103', { dueAt: '2026-11-03T00:00:00.000Z', overdue: true }) })
    expect(screen.getAllByText(/3 Nov · late/).length).toBeGreaterThan(0)
  })

  it('says why the checkbox is off, and is off while it saves', () => {
    row({ entry: entry('NEX-105'), cantTick: CANT })
    const box = screen.getByRole('checkbox', { name: 'Mark NEX-105 done' }) as HTMLInputElement
    expect(box.disabled).toBe(true)
    expect(box.closest('label')!.getAttribute('title')).toBe(CANT)
    cleanup()
    row({ entry: entry('NEX-105'), saving: true })
    expect((screen.getByRole('checkbox', { name: 'Mark NEX-105 done' }) as HTMLInputElement).disabled).toBe(true)
  })

  it('opens the task from its title, and offers Remove from list only to whoever may post', () => {
    const onRemove = vi.fn()
    row({ entry: entry('NEX-105'), onRemove })
    expect(screen.getByRole('link', { name: 'Title of NEX-105' }).getAttribute('href')).toBe('/?ticket=X')
    fireEvent.click(screen.getByRole('button', { name: 'Task actions for NEX-105' }))
    expect(screen.getByRole('menuitem', { name: /Open task/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove from list/ }))
    expect(onRemove).toHaveBeenCalled()
    cleanup()
    row({ entry: entry('NEX-105') })
    fireEvent.click(screen.getByRole('button', { name: 'Task actions for NEX-105' }))
    expect(screen.queryByRole('menuitem', { name: /Remove from list/ })).toBeNull()
  })

  it('shows its error as a sentence on the row', () => {
    row({ entry: entry('NEX-105'), error: 'This task is archived. Restore it first.' })
    expect(screen.getByText('This task is archived. Restore it first.')).toBeTruthy()
  })
})
