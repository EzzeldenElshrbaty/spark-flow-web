// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivityEntry, ProjectSummary } from '@/api/types'
import { HistoryTab } from './HistoryTab'

// UX Phase 4, 4.10: a project's history in days, and one person's entries through ?who=.

const today = new Date()
const yesterday = new Date(today.getTime() - 86_400_000)
const entry = (id: string, actorId: string, at: Date): ActivityEntry => ({ id, projectId: 'p-nex', taskKey: null, actorId, at: at.toISOString(), kind: 'project.changed', changes: [] }) as ActivityEntry
const entries = [entry('a', 'u-2', today), entry('b', 'u-3', yesterday)]
vi.mock('@/api/activity', () => ({ useProjectHistory: () => ({ data: { pages: [{ items: entries }] }, isError: false, hasNextPage: false }) }))

afterEach(cleanup)

const people = [
  { id: 'u-2', name: 'Nour El-Sayed' },
  { id: 'u-3', name: 'Mariam Fathy' },
] as never
async function open(search = '') {
  const router = createMemoryRouter([{ path: '/w/:ws/p/:key/history', element: <HistoryTab project={{ id: 'p-nex' } as ProjectSummary} people={people} phases={[]} /> }], {
    initialEntries: [`/w/engineering/p/NEX/history${search}`],
  })
  await act(async () => render(<RouterProvider router={router} />))
  return router
}

describe('History by day and by person (UX Phase 4)', () => {
  it('groups under Today and Yesterday', async () => {
    await open()
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeTruthy()
  })

  it('Person keeps one person’s entries, as a step Back undoes', async () => {
    const router = await open()
    const person = screen.getByRole('combobox', { name: 'Person' }) as HTMLSelectElement
    expect([...person.options].map((o) => o.textContent)).toEqual(['Anyone', 'Mariam Fathy', 'Nour El-Sayed'])
    await act(async () => fireEvent.change(person, { target: { value: 'u-3' } }))
    expect(router.state.location.search).toBe('?who=u-3')
    expect(router.state.historyAction).toBe('PUSH')
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeTruthy()
  })
})
