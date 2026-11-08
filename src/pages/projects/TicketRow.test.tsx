// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { TaskView } from '@/api/types'
import { TicketRow } from './TicketRow'

afterEach(cleanup)

const ticket = (over: Partial<TaskView>) =>
  ({
    id: 't', key: 'NEX-106', title: 'Unread badge', type: 'task', status: 'todo', category: 'todo', priority: 'medium', assigneeId: null,
    dueAt: '2026-11-15T00:00:00.000Z', estimateHours: 6, loggedHours: 21.9, overdue: false, overEstimate: false, attachments: [], ...over,
  }) as TaskView
const card = (over: Partial<TaskView>) =>
  render(
    <MemoryRouter>
      <TicketRow ticket={ticket(over)} assignee={null} variant="card" />
    </MemoryRouter>,
  )

describe('TicketRow: Overdue and Over estimate apart (UX Phase 1, 1.1)', () => {
  it('a task only over its estimate shows the amber "Over estimate" pill and amber hours, not "Overdue"', () => {
    card({ overEstimate: true })
    expect(screen.getByText('Over estimate')).toBeTruthy()
    expect(screen.queryByText('Overdue')).toBeNull()
    expect(screen.getByText('21.9 / 6 h').className).toMatch(/text-amber-700/)
  })

  it('a task both late and over its estimate shows both pills', () => {
    card({ overdue: true, overEstimate: true })
    expect(screen.getByText('Overdue')).toBeTruthy()
    expect(screen.getByText('Over estimate')).toBeTruthy()
  })
})
