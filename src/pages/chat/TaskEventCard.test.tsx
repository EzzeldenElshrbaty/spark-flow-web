// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatMessage, TaskEvent, TaskRef, User } from '@/api/types'
import { parseBody } from '@/lib/messageBody'
import type { BodyContext } from '@/pages/chat/MessageBody'
import { TaskEventCard } from '@/pages/chat/TaskEventCard'

afterEach(cleanup)

const users = [
  { id: 'u-2', name: 'Nour El-Sayed', title: 'Backend lead', email: 'nour@spark-sys.com', presence: 'away' },
  { id: 'u-4', name: 'Ahmed Shawky', title: 'Project Manager', email: 'ahmed@spark-sys.com', presence: 'active' },
] as User[]
const task: TaskRef = { key: 'SEL-103', title: 'Update login page', status: 'todo', statusLabel: 'To do', category: 'todo', projectKey: 'SEL', projectName: 'Sela booking', assigneeId: 'u-4' }
const ctx = (tasks: TaskRef[] = [task]): BodyContext => ({ users, tasks: new Map(tasks.map((t) => [t.key, t])), projectKeys: new Set(['SEL']), ws: 'engineering', workspaceId: 'ws-eng' })

const message = (content: string, taskEvent: TaskEvent): ChatMessage => ({
  id: 'm1', channelId: 'c-p-sel', seq: 1, senderId: 'u-4', content, body: parseBody(content), attachments: [], reactions: [], threadCount: 0, lastReplyAt: null,
  linkedTicketKeys: [taskEvent.key], mentions: [], editedAt: null, createdAt: '2026-11-10T01:09:00.000Z', taskEvent,
})

function Where() {
  const { search } = useLocation()
  return <span data-testid="where">{search}</span>
}
const show = (m: ChatMessage, c = ctx()) =>
  render(
    <MemoryRouter initialEntries={['/w/engineering/c/c-p-sel']}>
      <TaskEventCard message={m} users={users} ctx={c} />
      <Where />
    </MemoryRouter>,
  )

describe('TaskEventCard: a task change in its project’s chat, as the task’s card', () => {
  it('shows the task like a mention’s card: title, key, live status, project, and what happened', () => {
    show(message('Created SEL-103: Update login page', { key: 'SEL-103', kind: 'created' }))
    const card = screen.getByRole('link')
    expect(within(card).getByText('Update login page')).toBeTruthy()
    expect(card.textContent).toContain('SEL-103 · To do · Sela booking')
    expect(within(card).getByText('Created')).toBeTruthy()
  })

  it('is one link: anywhere on it opens the task’s panel', () => {
    show(message('Created SEL-103: Update login page', { key: 'SEL-103', kind: 'created' }))
    expect(screen.getAllByRole('link')).toHaveLength(1)
    fireEvent.click(screen.getByText('Update login page'))
    expect(screen.getByTestId('where').textContent).toContain('ticket=SEL-103')
  })

  it.each([
    ['assigned', { key: 'SEL-103', kind: 'assigned', assigneeId: 'u-2' } as TaskEvent, 'Assigned', 'to Nour El-Sayed'],
    ['moved', { key: 'SEL-103', kind: 'status', status: 'inReview', statusLabel: 'In review' } as TaskEvent, 'Moved', 'to In review'],
  ])('says to whom or where when %s', (_, event, tag, detail) => {
    show(message('SEL-103 changed', event))
    const card = screen.getByRole('link')
    expect(within(card).getByText(tag)).toBeTruthy()
    expect(within(card).getByText(detail)).toBeTruthy()
  })

  it('marks Done', () => {
    show(message('Done: SEL-103 Update login page', { key: 'SEL-103', kind: 'done' }))
    expect(within(screen.getByRole('link')).getByText('Done')).toBeTruthy()
  })

  it('keeps the plain card for a task I can’t see: its key opens it, the message’s own text stays', () => {
    show(message('Created SEL-103: Update login page', { key: 'SEL-103', kind: 'created' }), ctx([]))
    expect(screen.getByRole('link').textContent).toBe('SEL-103')
    expect(screen.getByText('Created')).toBeTruthy()
    expect(screen.getByText('Update login page')).toBeTruthy()
  })
})
