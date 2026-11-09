// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MentionItem, TaskView } from '@/api/types'
import { navGroups } from '@/navigation'
import { MyTasksRedirect, MyWorkPage } from './MyWorkPage'

// UX Phase 2, 2.1: Home and My tasks are one page, My work: today's timer, every open task of mine with Start, and
// mentions with a way to see them all. The Dashboard stays everyone's start page.

const task = (over: Partial<TaskView>) =>
  ({
    id: over.key, projectId: 'p-nex', title: over.key, type: 'task', status: 'todo', category: 'todo', priority: 'medium', assigneeId: 'u-3',
    dueAt: null, estimateHours: null, loggedHours: 0, overdue: false, overEstimate: false, attachments: [], ...over,
  }) as TaskView
let tasks: TaskView[] = []
const mentions: MentionItem[] = [{ id: 'm1', source: 'message', authorName: 'Nour El-Sayed', excerpt: 'Can you take NEX-106?', createdAt: '2026-11-08T10:00:00.000Z', read: false, workspaceId: 'ws-eng' } as MentionItem]
const start = vi.fn()

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-3', name: 'Mariam Fathy' } }) }))
vi.mock('@/lib/useCanLog', () => ({ useCanLog: () => () => true }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: [{ id: 'p-nex', key: 'NEX', name: 'Nexus Core' }], isPending: false, isError: false }) }))
vi.mock('@/api/workspaces', () => ({ useWorkspaces: () => ({ data: [{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }] }) }))
vi.mock('@/api/tickets', () => ({ useTasksOf: () => ({ data: tasks, isPending: false, isError: false, refetch: () => {} }), useArchivedTasksOf: () => [] }))
vi.mock('@/api/time', () => ({ useMyDay: () => ({ data: { day: '2026-11-09', entries: [], timer: null, firstStart: false }, isPending: false, isError: false }), useStartTimer: () => ({ mutate: start, isPending: false, error: null }) }))
vi.mock('@/api/mentions', () => ({ useMyMentions: () => ({ data: mentions, isPending: false, isError: false }), useMarkMentionsRead: () => ({ mutate: vi.fn() }) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [{ id: 'u-3', name: 'Mariam Fathy' }] }) }))
vi.mock('./TodayCard', () => ({ TodayCard: () => <section aria-label="Today" /> }))
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

beforeEach(() => {
  start.mockReset()
  tasks = [
    task({ key: 'NEX-110', dueAt: '2026-12-01T00:00:00.000Z' }),
    task({ key: 'NEX-106', overEstimate: true }),
    task({ key: 'NEX-102', overdue: true, dueAt: '2026-11-01T00:00:00.000Z' }),
    task({ key: 'NEX-999', assigneeId: 'u-2' }),
  ]
})
afterEach(cleanup)

let where = ''
function Search() {
  where = useLocation().search
  return null
}
const show = (search = '') =>
  render(
    <MemoryRouter initialEntries={[`/w/engineering${search}`]}>
      <MyWorkPage />
      <Search />
    </MemoryRouter>,
  )

describe('My work (UX Phase 2, 2.1)', () => {
  it('is titled My work, greets me and counts my tasks', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'My work' })).toBeTruthy()
    expect(screen.getByText(/Mariam · 3 open tasks · 1 overdue · 1 over estimate$/)).toBeTruthy()
  })

  it('lists every open task of mine, overdue first, then over estimate, then by due date, each with Start', () => {
    show()
    const card = screen.getByRole('region', { name: 'My tasks' })
    const keys = within(card).getAllByRole('link').map((a) => a.textContent?.match(/NEX-\d+/)?.[0]).filter(Boolean)
    expect(keys).toEqual(['NEX-102', 'NEX-106', 'NEX-110'])
    fireEvent.click(within(card).getByRole('button', { name: 'Start timer on NEX-106' }))
    expect(start).toHaveBeenCalledWith({ taskId: 'NEX-106' })
  })

  it('keeps Today and Mentions, with See all going to Activity; the Due today card is gone', () => {
    show()
    expect(screen.getByRole('region', { name: 'Today' })).toBeTruthy()
    const mentionsCard = screen.getByRole('region', { name: 'Mentions' })
    expect(within(mentionsCard).getByRole('link', { name: 'See all' }).getAttribute('href')).toBe('/w/engineering/activity')
    expect(screen.queryByText('Due today and overdue')).toBeNull()
  })

  it('with nothing assigned, says so and points to the projects', () => {
    tasks = []
    show()
    expect(screen.getByText('Nothing assigned to you. Tasks assigned to you show here.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse projects' }).getAttribute('href')).toBe('/w/engineering/projects')
  })
})

describe('the Work menu (UX Phase 2, 2.1)', () => {
  it('reads Dashboard, My work, Projects, Teams', () => {
    expect(navGroups[0]!.items.map((i) => i.label)).toEqual(['Dashboard', 'My work', 'Projects', 'Teams'])
  })
})

describe('old My tasks links (UX Phase 2, 2.1)', () => {
  it('/w/:ws/tasks opens My work, keeping its query', () => {
    render(
      <MemoryRouter initialEntries={['/w/engineering/tasks?ticket=NEX-106']}>
        <Routes>
          <Route path="/w/:ws/tasks" element={<MyTasksRedirect />} />
          <Route path="/w/:ws" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('where').textContent).toBe('/w/engineering?ticket=NEX-106')
  })
})

function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{pathname + search}</p>
}

// UX Phase 4, 4.2: attention tiles that filter my tasks, and a search, both in the address.
describe('My work’s tiles and search (UX Phase 4)', () => {
  const listed = () => within(screen.getByRole('region', { name: 'My tasks' })).getAllByRole('link').map((a) => a.textContent ?? '')
  it('four tiles count my open tasks; Overdue filters, and clicking it again clears', () => {
    show()
    const overdue = screen.getByRole('button', { name: /Overdue/ })
    expect(overdue.textContent).toContain('1')
    expect(screen.getByRole('button', { name: /Over estimate/ }).textContent).toContain('1')
    expect(screen.getByRole('button', { name: /Due today/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /In progress/ })).toBeTruthy()
    fireEvent.click(overdue)
    expect(where).toBe('?show=overdue')
    expect(listed().every((text) => text.includes('NEX-102'))).toBe(true)
    expect(screen.getByRole('status').textContent).toBe('Showing 1 of 3 open tasks · Clear filters')
    fireEvent.click(screen.getByRole('button', { name: /Overdue/ }))
    expect(where).toBe('')
  })

  it('?q= searches my tasks; nothing matching says so with Clear', () => {
    show('?q=nex-106')
    expect(listed().every((text) => text.includes('NEX-106'))).toBe(true)
    cleanup()
    show('?q=zzz')
    expect(screen.getByText('None of your open tasks match “zzz”.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    expect(where).toBe('')
  })
})
