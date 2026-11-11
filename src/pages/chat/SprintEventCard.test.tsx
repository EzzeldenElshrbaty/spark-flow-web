// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatMessage, SprintEvent } from '@/api/types'
import { parseBody } from '@/lib/messageBody'
import { paths } from '@/lib/paths'
import type { BodyContext } from '@/pages/chat/MessageBody'
import { SprintEventCard } from '@/pages/chat/SprintEventCard'

afterEach(cleanup)

const ctx = (keys = ['NEX']): BodyContext => ({ users: [], tasks: new Map(), projectKeys: new Set(keys), ws: 'engineering', workspaceId: 'ws-eng' })

// A sprint's end is the end of its last day, in the viewer's own time (lib/sprints.ts); 25 Nov 2025 is a Tuesday.
const ENDS = new Date(2025, 10, 25, 23, 59, 59, 999).toISOString()

const started = (over: Partial<Extract<SprintEvent, { kind: 'started' }>> = {}): SprintEvent => ({
  kind: 'started', projectKey: 'NEX', sprintId: 's-nex-2', name: 'Sprint 15', goal: 'Ship search filters', endDate: ENDS, tasks: 12, points: 31, ...over,
})
const completed = (over: Partial<Extract<SprintEvent, { kind: 'completed' }>> = {}): SprintEvent => ({
  kind: 'completed', projectKey: 'NEX', sprintId: 's-nex-1', name: 'Sprint 14', done: 18, total: 23, movedTo: 'Sprint 15', moved: 5, ...over,
})

const message = (sprintEvent: SprintEvent): ChatMessage => ({
  id: 'm1', channelId: 'c-p-nex', seq: 1, senderId: 'u-2', content: 'Started Sprint 15', body: parseBody('Started Sprint 15'), attachments: [], reactions: [], threadCount: 0, lastReplyAt: null,
  linkedTicketKeys: [], mentions: [], editedAt: null, createdAt: '2026-11-10T01:09:00.000Z', sprintEvent,
})

// No query client and no data: the card is drawn from the message alone.
const show = (event: SprintEvent, c = ctx()) =>
  render(
    <MemoryRouter initialEntries={['/w/engineering/c/c-p-nex']}>
      <SprintEventCard message={message(event)} ctx={c} />
    </MemoryRouter>,
  )

describe('SprintEventCard: a sprint starting or completing, in its project’s chat', () => {
  it('started: says when it ends, the goal, and how much is in it, and opens the Sprints view', () => {
    show(started())
    const card = screen.getByRole('link')
    expect(card.textContent).toContain('Sprint 15 started · ends Tue 25 Nov')
    expect(card.textContent).toContain('Ship search filters')
    expect(card.textContent).toContain('12 tasks · 31 points')
    expect(card.getAttribute('href')).toBe(paths.project('engineering', 'NEX', 'tasks', { view: 'sprints' }))
    expect(card.getAttribute('href')).toBe('/w/engineering/p/NEX/tasks?view=sprints')
  })

  it('started with no goal has no goal line', () => {
    show(started({ goal: '' }))
    expect(screen.getByRole('link').textContent).toBe('Sprint 15 started · ends Tue 25 Nov12 tasks · 31 points')
  })

  it('completed: says how many tasks were done and where the unfinished ones went', () => {
    show(completed())
    const card = screen.getByRole('link')
    expect(card.textContent).toContain('Sprint 14 completed · 18 of 23 tasks done')
    expect(card.textContent).toContain('5 moved to Sprint 15')
    expect(card.getAttribute('href')).toBe('/w/engineering/p/NEX/tasks?view=sprints')
  })

  it('completed to the backlog: says so', () => {
    show(completed({ movedTo: null }))
    expect(screen.getByRole('link').textContent).toContain('5 moved to the backlog')
  })

  it('completed with nothing unfinished: no moved line, even into a new sprint', () => {
    show(completed({ done: 23, moved: 0, movedTo: 'Sprint 15' }))
    const card = screen.getByRole('link')
    expect(card.textContent).toBe('Sprint 14 completed · 23 of 23 tasks done')
    cleanup()
    show(completed({ done: 23, moved: 0, movedTo: null }))
    expect(screen.getByRole('link').textContent).not.toContain('moved')
  })

  it('says one task, one point and one moved in the singular', () => {
    show(started({ tasks: 1, points: 1 }))
    expect(screen.getByRole('link').textContent).toContain('1 task · 1 point')
    expect(screen.getByRole('link').textContent).not.toContain('1 tasks')
    expect(screen.getByRole('link').textContent).not.toContain('1 points')
    cleanup()
    show(completed({ done: 1, total: 1, moved: 1 }))
    expect(screen.getByRole('link').textContent).toBe('Sprint 14 completed · 1 of 1 task done1 moved to Sprint 15')
    cleanup()
    show(started({ tasks: 3, points: 0 }))
    expect(screen.getByRole('link').textContent).toContain('3 tasks · 0 points')
  })

  it('is plain text, with no link, when the project isn’t one I can see', () => {
    show(started(), ctx(['BRD']))
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Sprint 15 started · ends Tue 25 Nov')).toBeTruthy()
    expect(screen.getByText('Ship search filters')).toBeTruthy()
    expect(screen.getByText('12 tasks · 31 points')).toBeTruthy()
    cleanup()
    show(completed(), ctx([]))
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Sprint 14 completed · 18 of 23 tasks done')).toBeTruthy()
    expect(screen.getByText('5 moved to Sprint 15')).toBeTruthy()
  })

  it('reads its numbers from the card, not from a live sprint: it needs no query client', () => {
    // Nothing wraps it but a router: a hook that asked for a sprint would throw for want of a QueryClientProvider.
    show(started({ name: 'Sprint 15 (renamed since)', tasks: 4, points: 9 }))
    const card = screen.getByRole('link')
    expect(card.textContent).toContain('Sprint 15 (renamed since) started')
    expect(card.textContent).toContain('4 tasks · 9 points')
  })
})
