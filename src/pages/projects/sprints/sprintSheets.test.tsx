// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectSummary, Sprint, TaskView } from '@/api/types'
import { announce, Announcer } from '@/components/sf/Announcer'
import { CompleteSprintSheet } from './CompleteSprintSheet'
import { DeleteSprintSheet } from './DeleteSprintSheet'
import { SprintSheet } from './SprintSheet'

// Sprints spec §6.2: the sheets behind the Sprints view's buttons — create, edit, start, complete and delete.

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

type Options = { onSuccess?: (result: unknown) => void }
const mutation = () => ({ mutate: vi.fn<(variables: unknown, options?: Options) => void>(), isPending: false, error: null as Error | null })
const create = mutation()
const update = mutation()
const start = mutation()
const complete = mutation()
const remove = mutation()
vi.mock('@/api/sprints', () => ({ useCreateSprint: () => create, useUpdateSprint: () => update, useStartSprint: () => start, useCompleteSprint: () => complete, useRemoveSprint: () => remove }))

/** A save that lands at once: the sheet's `onSuccess` runs. */
const succeeds = (m: ReturnType<typeof mutation>) => m.mutate.mockImplementation((_variables, options) => options?.onSuccess?.({}))

// Today is Thursday 12 Nov 2026; Date alone is fake, so the sheets' own clocks agree with it.
const NOW = new Date(2026, 10, 12, 10)
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  // The one live region keeps the last sentence between tests.
  announce('')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  for (const m of [create, update, start, complete, remove]) {
    m.mutate.mockReset()
    m.isPending = false
    m.error = null
  }
})

const project = { id: 'p-nex', key: 'NEX', name: 'Nexus Core', methodology: 'agile', managerId: 'u-2' } as unknown as ProjectSummary

const day = (d: number, m = 10) => new Date(2026, m, d).toISOString()
const end = (d: number, m = 10) => new Date(2026, m, d, 23, 59, 59, 999).toISOString()
const s13: Sprint = { id: 's-nex-0', projectId: 'p-nex', name: 'Sprint 13', goal: '', startDate: day(20, 9), endDate: end(2), state: 'closed' }
const s14: Sprint = { id: 's-nex-1', projectId: 'p-nex', name: 'Sprint 14', goal: 'Rotate refresh tokens.', startDate: day(3), endDate: end(17), state: 'active' }
const s15: Sprint = { id: 's-nex-2', projectId: 'p-nex', name: 'Sprint 15', goal: 'Audit log for role changes.', startDate: day(18), endDate: end(1, 11), state: 'planned' }
const s16: Sprint = { id: 's-nex-3', projectId: 'p-nex', name: 'Sprint 16', goal: '', startDate: day(2, 11), endDate: end(15, 11), state: 'planned' }

const category = { backlog: 'todo', todo: 'todo', inProgress: 'inProgress', done: 'done' } as const
const task = (key: string, status: keyof typeof category, sprintId: string | null, storyPoints: number | null, archivedAt: string | null = null) =>
  ({ id: key, key, title: `Task ${key}`, status, category: category[status], sprintId, storyPoints, archivedAt }) as unknown as TaskView

// As the seed: Sprint 14 has seven tasks (23 points), two of them done; Sprint 15 holds three (8 points).
const TASKS = [
  task('NEX-101', 'inProgress', 's-nex-1', 5),
  task('NEX-102', 'todo', 's-nex-1', 3),
  task('NEX-103', 'done', 's-nex-1', 2),
  task('NEX-104', 'done', 's-nex-1', 2),
  task('NEX-105', 'inProgress', 's-nex-1', 8),
  task('NEX-106', 'todo', 's-nex-1', 3),
  task('NEX-107', 'inProgress', 's-nex-1', null),
  task('NEX-110', 'todo', 's-nex-2', 5),
  task('NEX-111', 'todo', 's-nex-2', 3),
  task('NEX-112', 'backlog', 's-nex-2', null),
  task('NEX-120', 'todo', 's-nex-3', 1),
  task('NEX-121', 'todo', 's-nex-3', 1),
  task('NEX-122', 'done', 's-nex-3', 1),
  // An archived task doesn't count (spec §5).
  task('NEX-123', 'todo', 's-nex-3', 5, '2026-11-01T00:00:00.000Z'),
  task('NEX-130', 'todo', null, 2),
]

const nameField = () => screen.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement
const goalField = () => screen.getByRole('textbox', { name: /^Goal/ }) as HTMLTextAreaElement
const startField = () => screen.getByLabelText(/^Start/, { selector: 'input' }) as HTMLInputElement
const endField = () => screen.getByLabelText(/^End/, { selector: 'input' }) as HTMLInputElement
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
/** What's under the field that holds this message (the error sits after its label, inside the Field). */
const fieldOf = (message: string) => screen.getByText(message).parentElement
const said = () => document.querySelector('[role="status"].sr-only')?.textContent

type Mode = 'create' | 'edit' | 'start'
function mountSheet(mode: Mode, { sprint, sprints = [s13, s14, s15], onClose = vi.fn() }: { sprint?: Sprint; sprints?: Sprint[]; onClose?: () => void } = {}) {
  const props = mode === 'create' ? ({ mode } as const) : ({ mode, sprint: sprint ?? s15 } as const)
  render(
    <>
      <SprintSheet {...props} project={project} sprints={sprints} tasks={TASKS} onClose={onClose} />
      <Announcer />
    </>,
  )
  return onClose
}

describe('Create sprint', () => {
  it('fills “Sprint 16” and two weeks after Sprint 15; Save creates it, closes, announces “Sprint 16 created.”', () => {
    succeeds(create)
    const onClose = mountSheet('create', { sprints: [s14, s15] })
    expect(screen.getByRole('dialog', { name: 'Create sprint' })).toBeTruthy()
    expect(nameField().value).toBe('Sprint 16')
    expect(goalField().value).toBe('')
    // The day after Sprint 15 ends, for two weeks, counting the first and last day.
    expect(startField().value).toBe('2026-12-02')
    expect(endField().value).toBe('2026-12-15')
    click('Save')
    expect(create.mutate).toHaveBeenCalledTimes(1)
    // The start is the start of its day and the end the end of its day, as the defaults are.
    expect(create.mutate.mock.calls[0]![0]).toEqual({ projectId: 'p-nex', name: 'Sprint 16', goal: '', startDate: new Date(2026, 11, 2).toISOString(), endDate: new Date(2026, 11, 15, 23, 59, 59, 999).toISOString() })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(said()).toBe('Sprint 16 created.')
  })

  it('names a sprint after the name typed, trimmed, and sends what was typed', () => {
    succeeds(create)
    mountSheet('create')
    type(nameField(), '  Sprint 16 · Search  ')
    type(goalField(), 'Ship search.')
    type(startField(), '2026-12-07')
    type(endField(), '2026-12-18')
    click('Save')
    expect(create.mutate.mock.calls[0]![0]).toEqual({ projectId: 'p-nex', name: 'Sprint 16 · Search', goal: 'Ship search.', startDate: new Date(2026, 11, 7).toISOString(), endDate: new Date(2026, 11, 18, 23, 59, 59, 999).toISOString() })
    expect(said()).toBe('Sprint 16 · Search created.')
  })

  it('errors show only after the first Save, under their field (name, goal, end date), and leave as each is fixed', () => {
    mountSheet('create')
    type(nameField(), '   ')
    type(goalField(), 'x'.repeat(501))
    type(endField(), '2026-12-01')
    for (const sentence of ['Give the sprint a name.', 'Keep the goal under 500 characters.', 'The end date must be after the start date.']) expect(screen.queryByText(sentence)).toBeNull()
    click('Save')
    expect(create.mutate).not.toHaveBeenCalled()
    expect(fieldOf('Give the sprint a name.')?.textContent).toContain('Name')
    expect(fieldOf('Keep the goal under 500 characters.')?.textContent).toContain('Goal')
    expect(fieldOf('The end date must be after the start date.')?.textContent).toContain('End')
    expect(nameField().getAttribute('aria-invalid')).toBe('true')
    expect(endField().getAttribute('aria-invalid')).toBe('true')
    // The caret goes to the first one.
    expect(document.activeElement).toBe(nameField())
    type(nameField(), 'Sprint 16')
    expect(screen.queryByText('Give the sprint a name.')).toBeNull()
    type(goalField(), 'Ship search.')
    type(endField(), '2026-12-15')
    expect(screen.queryByText('Keep the goal under 500 characters.')).toBeNull()
    expect(screen.queryByText('The end date must be after the start date.')).toBeNull()
  })

  it('an empty date asks for it under its own field, not under End', () => {
    mountSheet('create')
    type(startField(), '')
    click('Save')
    expect(fieldOf('Pick a start date.')?.textContent).toContain('Start')
    expect(screen.queryByText('The end date must be after the start date.')).toBeNull()
    type(startField(), '2026-12-02')
    type(endField(), '')
    expect(fieldOf('Pick an end date.')?.textContent).toContain('End')
    expect(create.mutate).not.toHaveBeenCalled()
  })

  it('Enter in a field saves, and a second Enter while it saves sends nothing', () => {
    mountSheet('create')
    fireEvent.submit(nameField().form!)
    expect(create.mutate).toHaveBeenCalledTimes(1)
    create.mutate.mockClear()
    create.isPending = true
    cleanup()
    mountSheet('create')
    fireEvent.submit(nameField().form!)
    expect(create.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy()
  })

  it('untouched Cancel closes; a typed name asks “Discard this new sprint?”', () => {
    const onClose = mountSheet('create')
    click('Cancel')
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
    const again = mountSheet('create')
    type(nameField(), 'Sprint 17')
    click('Cancel')
    expect(screen.getByText('Discard this new sprint?')).toBeTruthy()
    expect(again).not.toHaveBeenCalled()
    click('Discard')
    expect(again).toHaveBeenCalledTimes(1)
  })

  it('a server refusal shows as a sentence on the form', () => {
    create.error = new Error('Only an Admin or the project’s manager can change sprints.')
    mountSheet('create')
    expect(screen.getByRole('alert').textContent).toBe('Only an Admin or the project’s manager can change sprints.')
  })
})

describe('Edit sprint', () => {
  it('fills from the sprint and sends only what changed; announces “Sprint 16 saved.”', () => {
    succeeds(update)
    const onClose = mountSheet('edit', { sprint: s16 })
    expect(screen.getByRole('dialog', { name: 'Edit sprint' })).toBeTruthy()
    expect(nameField().value).toBe('Sprint 16')
    expect(startField().value).toBe('2026-12-02')
    expect(endField().value).toBe('2026-12-15')
    type(goalField(), 'Ship search.')
    type(endField(), '2026-12-18')
    click('Save')
    expect(update.mutate.mock.calls[0]![0]).toEqual({ id: 's-nex-3', patch: { goal: 'Ship search.', endDate: new Date(2026, 11, 18, 23, 59, 59, 999).toISOString() } })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(said()).toBe('Sprint 16 saved.')
  })

  it('saving without a change just closes', () => {
    const onClose = mountSheet('edit', { sprint: s16 })
    click('Save')
    expect(update.mutate).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(said()).toBe('')
  })

  it('an active sprint edits too (its state stays); Cancel asks “Discard your changes?” once something changed', () => {
    const onClose = mountSheet('edit', { sprint: s14 })
    expect(nameField().value).toBe('Sprint 14')
    expect(screen.queryByText(/tasks ·/)).toBeNull()
    type(nameField(), 'Sprint 14b')
    click('Cancel')
    expect(screen.getByText('Discard your changes?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Start sprint', () => {
  it('fills name and goal from Sprint 15, shows its “3 tasks · 8 points”, and its primary button is “Start sprint”', () => {
    mountSheet('start')
    expect(screen.getByRole('dialog', { name: 'Start sprint' })).toBeTruthy()
    expect(nameField().value).toBe('Sprint 15')
    expect(goalField().value).toBe('Audit log for role changes.')
    // Today (Thu 12 Nov), for the 14 days Sprint 15 was planned for (18 Nov – 1 Dec, both counted).
    expect(startField().value).toBe('2026-11-12')
    expect(endField().value).toBe('2026-11-25')
    expect(screen.getByText('3 tasks · 8 points')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start sprint' }).className).toContain('bg-brand-500')
  })

  it('counts with plurals: “0 tasks · 0 points”, “1 task · 1 point”', () => {
    mountSheet('start', { sprint: { ...s15, id: 's-solo' }, sprints: [s14, { ...s15, id: 's-solo' }] })
    expect(screen.getByText('0 tasks · 0 points')).toBeTruthy()
    cleanup()
    render(<SprintSheet mode="start" project={project} sprint={s15} sprints={[s14, s15]} tasks={[task('NEX-110', 'todo', 's-nex-2', 1)]} onClose={() => {}} />)
    expect(screen.getByText('1 task · 1 point')).toBeTruthy()
  })

  it('Start sends the four fields as confirmed, closes and announces “Sprint 15 started.”', () => {
    succeeds(start)
    const onClose = mountSheet('start')
    type(goalField(), 'Audit log, then the load test.')
    type(endField(), '2026-12-02')
    click('Start sprint')
    expect(start.mutate.mock.calls[0]![0]).toEqual({
      id: 's-nex-2',
      input: { name: 'Sprint 15', goal: 'Audit log, then the load test.', startDate: new Date(2026, 10, 12).toISOString(), endDate: new Date(2026, 11, 2, 23, 59, 59, 999).toISOString() },
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(said()).toBe('Sprint 15 started.')
  })

  // The user's decision of 12 Nov 2026: a sprint starts when it's started, and keeps the length it was planned for.
  it('Start sprint opens on today and keeps the planned length', () => {
    succeeds(start)
    const planned = { ...s15, startDate: day(20), endDate: end(4, 11) }
    mountSheet('start', { sprint: planned, sprints: [s14, planned] })
    // 20 Nov – 4 Dec is 15 days, both counted: from today, 12 Nov, that's 12 Nov – 26 Nov.
    expect(startField().value).toBe('2026-11-12')
    expect(endField().value).toBe('2026-11-26')
    expect(nameField().value).toBe('Sprint 15')
    expect(goalField().value).toBe('Audit log for role changes.')
    click('Start sprint')
    expect(start.mutate.mock.calls[0]![0]).toEqual({
      id: 's-nex-2',
      input: { name: 'Sprint 15', goal: 'Audit log for role changes.', startDate: new Date(2026, 10, 12).toISOString(), endDate: new Date(2026, 10, 26, 23, 59, 59, 999).toISOString() },
    })
  })

  it('a planned sprint whose start has passed opens on today too', () => {
    const late = { ...s15, startDate: day(1), endDate: end(14) }
    mountSheet('start', { sprint: late, sprints: [s14, late] })
    // 1 Nov – 14 Nov is 14 days: 12 Nov – 25 Nov.
    expect(startField().value).toBe('2026-11-12')
    expect(endField().value).toBe('2026-11-25')
  })

  it('a one-day sprint ends the day it starts, and a long one carries across the month', () => {
    const oneDay = { ...s15, startDate: day(18), endDate: end(18) }
    mountSheet('start', { sprint: oneDay, sprints: [s14, oneDay] })
    expect(startField().value).toBe('2026-11-12')
    expect(endField().value).toBe('2026-11-12')
    cleanup()
    // 18 Nov – 31 Dec is 44 days: 12 Nov + 43 days is 25 Dec.
    const long = { ...s15, startDate: day(18), endDate: end(31, 11) }
    mountSheet('start', { sprint: long, sprints: [s14, long] })
    expect(endField().value).toBe('2026-12-25')
  })

  it('the dates it opens on aren’t a change: Cancel closes without asking until one is edited', () => {
    const onClose = mountSheet('start')
    click('Cancel')
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
    const again = mountSheet('start')
    type(endField(), '2026-12-01')
    click('Cancel')
    expect(screen.getByText('Discard your changes?')).toBeTruthy()
    expect(again).not.toHaveBeenCalled()
  })

  it('a 409 shows its sentence on the form and the sheet stays open', () => {
    start.error = new Error('Sprint 14 is still running. Complete it before you start another.')
    const onClose = mountSheet('start')
    expect(screen.getByRole('alert').textContent).toBe('Sprint 14 is still running. Complete it before you start another.')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('pending says “Starting…”; errors wait for the first Start; Cancel asks “Discard your changes?” after a change', () => {
    start.isPending = true
    mountSheet('start')
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeTruthy()
    cleanup()
    start.isPending = false
    const onClose = mountSheet('start')
    type(nameField(), '')
    expect(screen.queryByText('Give the sprint a name.')).toBeNull()
    click('Start sprint')
    expect(start.mutate).not.toHaveBeenCalled()
    expect(fieldOf('Give the sprint a name.')?.textContent).toContain('Name')
    click('Cancel')
    expect(screen.getByText('Discard your changes?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})

function mountComplete(sprints: Sprint[], tasks: TaskView[] = TASKS, sprint: Sprint = s14, onClose = vi.fn()) {
  render(
    <>
      <CompleteSprintSheet sprint={sprint} sprints={sprints} tasks={tasks} onClose={onClose} />
      <Announcer />
    </>,
  )
  return onClose
}
const moveTo = () => screen.getByRole('combobox', { name: /^Move the .* to$/ }) as HTMLSelectElement
const optionNames = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent)

describe('Complete sprint', () => {
  it('says “2 tasks done · 5 not done”; the select lists the next planned sprint, the other planned ones, “A new sprint”, “Backlog”', () => {
    mountComplete([s13, s14, s16, s15])
    expect(screen.getByRole('dialog', { name: 'Complete sprint' })).toBeTruthy()
    expect(screen.getByText('2 tasks done · 5 not done')).toBeTruthy()
    const select = screen.getByRole('combobox', { name: 'Move the 5 unfinished tasks to' }) as HTMLSelectElement
    expect(optionNames(select)).toEqual(['Sprint 15', 'Sprint 16', 'A new sprint', 'Backlog'])
    // The next planned sprint is the default.
    expect(select.value).toBe('s-nex-2')
    expect(screen.getByRole('button', { name: 'Complete sprint' }).className).toContain('bg-brand-500')
  })

  it('Complete sends the pick, closes and announces “Sprint 14 completed.”', () => {
    succeeds(complete)
    const onClose = mountComplete([s14, s15, s16])
    click('Complete sprint')
    expect(complete.mutate.mock.calls[0]![0]).toEqual({ id: 's-nex-1', moveTo: 's-nex-2' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(said()).toBe('Sprint 14 completed.')
  })

  it('“A new sprint” sends “new” and “Backlog” sends null', () => {
    mountComplete([s14, s15])
    type(moveTo(), 'new')
    click('Complete sprint')
    expect(complete.mutate.mock.calls[0]![0]).toEqual({ id: 's-nex-1', moveTo: 'new' })
    type(moveTo(), '')
    click('Complete sprint')
    expect(complete.mutate.mock.calls[1]![0]).toEqual({ id: 's-nex-1', moveTo: null })
  })

  it('with no planned sprint the select opens on “A new sprint”', () => {
    mountComplete([s13, s14])
    expect(optionNames(moveTo())).toEqual(['A new sprint', 'Backlog'])
    expect(moveTo().value).toBe('new')
  })

  it('says “1 task done · 1 not done” and “Move the 1 unfinished task to”', () => {
    mountComplete([s14, s15], [task('NEX-101', 'done', 's-nex-1', 2), task('NEX-102', 'todo', 's-nex-1', 3), task('NEX-103', 'todo', 's-nex-1', 3, '2026-11-01T00:00:00.000Z')])
    expect(screen.getByText('1 task done · 1 not done')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Move the 1 unfinished task to' })).toBeTruthy()
  })

  it('with nothing unfinished shows no select, and sends the backlog (never a new sprint)', () => {
    mountComplete([s14, s15], [task('NEX-101', 'done', 's-nex-1', 2), task('NEX-102', 'done', 's-nex-1', 3)])
    expect(screen.getByText('2 tasks done · 0 not done')).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
    click('Complete sprint')
    expect(complete.mutate.mock.calls[0]![0]).toEqual({ id: 's-nex-1', moveTo: null })
  })

  it('pending says “Completing…”; a refusal shows as a sentence; Cancel closes without asking', () => {
    complete.isPending = true
    mountComplete([s14, s15])
    expect(screen.getByRole('button', { name: 'Completing…' })).toBeTruthy()
    cleanup()
    complete.isPending = false
    complete.error = new Error('Only the running sprint can be completed.')
    const onClose = mountComplete([s14, s15])
    expect(screen.getByRole('alert').textContent).toBe('Only the running sprint can be completed.')
    click('Cancel')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

function mountDelete(tasks: TaskView[] = TASKS, sprint: Sprint = s16, onClose = vi.fn()) {
  render(
    <>
      <DeleteSprintSheet sprint={sprint} tasks={tasks} onClose={onClose} />
      <Announcer />
    </>,
  )
  return onClose
}

describe('Delete sprint', () => {
  it('is a danger confirm: “Delete Sprint 16? Its 3 tasks go to the backlog.”', () => {
    mountDelete()
    expect(screen.getByRole('dialog', { name: 'Delete Sprint 16?' })).toBeTruthy()
    expect(screen.getByText('Its 3 tasks go to the backlog.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete sprint' }).className).toContain('bg-red-600')
    expect(document.querySelector('.bg-brand-500')).toBeNull()
  })

  it('says “Its 1 task goes to the backlog.” for one', () => {
    mountDelete([task('NEX-120', 'todo', 's-nex-3', 1)])
    expect(screen.getByText('Its 1 task goes to the backlog.')).toBeTruthy()
  })

  it('says just “Delete Sprint 16?” when it has none', () => {
    mountDelete([task('NEX-120', 'todo', 's-nex-2', 1), task('NEX-121', 'todo', 's-nex-3', 1, '2026-11-01T00:00:00.000Z')])
    expect(screen.getByRole('dialog', { name: 'Delete Sprint 16?' })).toBeTruthy()
    expect(screen.queryByText(/go to the backlog|goes to the backlog/)).toBeNull()
  })

  it('Delete removes it, closes and announces “Sprint 16 deleted.”', () => {
    succeeds(remove)
    const onClose = mountDelete()
    click('Delete sprint')
    expect(remove.mutate.mock.calls[0]![0]).toBe('s-nex-3')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(said()).toBe('Sprint 16 deleted.')
  })

  it('pending says “Deleting…” and holds Cancel; a refusal shows as a sentence', () => {
    remove.isPending = true
    mountDelete()
    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    remove.isPending = false
    remove.error = new Error('Only a planned sprint can be deleted.')
    const onClose = mountDelete()
    expect(screen.getByRole('alert').textContent).toBe('Only a planned sprint can be deleted.')
    click('Cancel')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
