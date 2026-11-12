import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { announce } from '@/components/sf/Announcer'
import { api } from '@/lib/api'
import { useUiStore } from '@/lib/uiStore'
import { renderApp } from '@/test/app'
import { axeProblems } from '@/test/axe'
import { answersTouch } from '@/test/touch'

// Sprints spec §6.1 and §7: a manager plans a sprint by moving a backlog task into it — with the pointer, with the
// keyboard (Space, ↑, Space), and on a phone with Move to.

// Start from a fresh seed, as the Admin, the only one who may reset it.
beforeEach(async () => {
  await api.auth.signOut().catch(() => {})
  localStorage.setItem('spark-flow.session', 'u-1')
  await api.db.reset()
  // The tab's remembered phase and view outlive a file (the UI store's, kept in memory too): a phase picked earlier
  // would hide rows here.
  useUiStore.setState({ lastFilters: {}, lastProjectView: {} })
  // So is what the app last said.
  announce('')
})

const PATH = '/w/engineering/p/NEX/tasks?view=sprints'
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const section = (name: string) => screen.getByRole('region', { name })
/** What the app's live regions say now (the Announcer is one of them). */
const said = () => [...document.querySelectorAll('[role="status"]')].map((el) => el.textContent ?? '')
const keysIn = (name: string) => within(section(name)).queryAllByRole('link').map((a) => /[A-Z]+-\d+/.exec(a.textContent ?? '')?.[0])

/** Resolves once the page has stopped scrolling: a section's top holds still for 100 ms. */
async function scrolledToRest() {
  let last = Number.NaN
  for (let top = section('Sprint 15').getBoundingClientRect().top; top !== last; top = section('Sprint 15').getBoundingClientRect().top) {
    last = top
    await wait(100)
  }
}

/** A mouse drag from `from`'s middle to `to`'s, in steps, with the pointer and mouse events a browser sends (as the sidebar's test). */
async function drag(from: HTMLElement, to: HTMLElement) {
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const init = (x: number, y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 })
  const pointer = (x: number, y: number) => ({ ...init(x, y), pointerId: 1, isPrimary: true, pointerType: 'mouse' })
  const [x0, y0] = [a.left + a.width / 2, a.top + a.height / 2]
  const [x1, y1] = [b.left + b.width / 2, b.top + b.height / 2]
  from.dispatchEvent(new PointerEvent('pointerdown', pointer(x0, y0)))
  from.dispatchEvent(new MouseEvent('mousedown', init(x0, y0)))
  for (let i = 1; i <= 8; i++) {
    const [x, y] = [x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8]
    document.dispatchEvent(new PointerEvent('pointermove', pointer(x, y)))
    document.dispatchEvent(new MouseEvent('mousemove', init(x, y)))
    await wait(16)
  }
  document.dispatchEvent(new PointerEvent('pointerup', pointer(x1, y1)))
  document.dispatchEvent(new MouseEvent('mouseup', init(x1, y1)))
  await wait(50)
}

describe('planning a sprint (sprints spec §6.1)', () => {
  it('drags NEX-108 from Backlog into Sprint 15 with the pointer', async () => {
    const app = await renderApp({ path: PATH, as: 'pm', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(keysIn('Backlog')).toContain('NEX-108')
    expect(await axeProblems(document)).toEqual([])
    // Both in view, so the drag doesn't scroll the page under the pointer.
    section('Sprint 15').scrollIntoView({ block: 'center' })
    await drag(screen.getByRole('button', { name: 'Drag NEX-108' }), within(section('Sprint 15')).getByRole('heading', { name: 'Sprint 15' }))
    await vi.waitFor(() => expect(keysIn('Sprint 15')).toEqual(['NEX-108', 'NEX-110']))
    await app.settled()
    expect(keysIn('Backlog')).not.toContain('NEX-108')
    expect((await api.tickets.get('NEX-108')).sprintId).toBe('s-nex-2')
    expect(app.consoleErrors).toEqual([])
  })

  // Sprints final review: reopened after its sprint closed, a task is to plan again.
  it('a task left unfinished in a closed sprint is in Backlog, and drags into Sprint 15', async () => {
    // Sprint 14 completes (its unfinished tasks go to Sprint 15), then NEX-103, done in it, is reopened.
    await api.sprints.complete('s-nex-1', { moveTo: 's-nex-2' })
    await api.tasks.update('NEX-103', { status: 'todo' })
    const app = await renderApp({ path: PATH, as: 'pm', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(keysIn('Backlog')).toEqual(['NEX-108', 'NEX-109', 'NEX-103'])
    // Both in view: Backlog in the middle, Sprint 15's last row above it.
    section('Backlog').scrollIntoView({ block: 'center' })
    await drag(screen.getByRole('button', { name: 'Drag NEX-103' }), within(section('Sprint 15')).getAllByRole('link').at(-1)!)
    await vi.waitFor(() => expect(keysIn('Sprint 15')).toContain('NEX-103'))
    await app.settled()
    expect(keysIn('Backlog')).toEqual(['NEX-108', 'NEX-109'])
    expect((await api.tickets.get('NEX-103')).sprintId).toBe('s-nex-2')
    expect(app.consoleErrors).toEqual([])
  })

  it('a drop back on the row’s own section changes nothing', async () => {
    const app = await renderApp({ path: PATH, as: 'pm', theme: 'light', size: 'desktop' })
    await app.settled()
    section('Backlog').scrollIntoView({ block: 'center' })
    const updated = (await api.tickets.get('NEX-108')).updatedAt
    await drag(screen.getByRole('button', { name: 'Drag NEX-108' }), within(section('Backlog')).getByRole('heading', { name: 'Backlog' }))
    await app.settled()
    // It was picked up and dropped, and nothing was saved.
    expect(document.body.textContent).toContain('Dropped NEX-108 in Backlog.')
    expect(keysIn('Backlog')).toContain('NEX-108')
    expect((await api.tickets.get('NEX-108')).updatedAt).toBe(updated)
  })

  it('moves NEX-108 with the keyboard: Space, ↑, Space', async () => {
    const app = await renderApp({ path: PATH, as: 'pm', theme: 'light', size: 'desktop' })
    await app.settled()
    const handle = screen.getByRole('button', { name: 'Drag NEX-108' })
    handle.focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowUp}')
    // Down the page the sensor scrolls to the zone rather than moving the row, smoothly: the Space that drops waits for
    // it to arrive (a manager's page is longer, with Create sprint and each section's buttons).
    await scrolledToRest()
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(keysIn('Sprint 15')).toEqual(['NEX-108', 'NEX-110']))
    await app.settled()
    expect((await api.tickets.get('NEX-108')).sprintId).toBe('s-nex-2')
    // The board's words, said once it's dropped; focus stays on the handle, now in Sprint 15.
    await vi.waitFor(() => expect(document.body.textContent).toContain('Dropped NEX-108 in Sprint 15.'))
    await vi.waitFor(() => expect(document.activeElement).toBe(within(section('Sprint 15')).getByRole('button', { name: 'Drag NEX-108' })))
  })

  it('on a 390 px phone, Move to moves it', async () => {
    const app = await renderApp({ path: PATH, as: 'pm', theme: 'dark', size: 'phone' })
    await app.settled()
    const moveTo = screen.getByRole('button', { name: 'Move to: NEX-108' })
    moveTo.scrollIntoView({ block: 'center' })
    expect(answersTouch(moveTo)).toEqual([true, true, true, true])
    await userEvent.click(moveTo)
    const menu = screen.getByRole('menu', { name: 'Move NEX-108 to' })
    // The bottom sheet passes axe as it stands.
    expect(await axeProblems(document)).toEqual([])
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Sprint 15' }))
    await vi.waitFor(() => expect(keysIn('Sprint 15')).toEqual(['NEX-108', 'NEX-110']))
    await app.settled()
    expect((await api.tickets.get('NEX-108')).sprintId).toBe('s-nex-2')
    // Focus follows the row onto its Move to in Sprint 15, and the move is said once (UX Phase 5A).
    expect(document.activeElement).toBe(within(section('Sprint 15')).getByRole('button', { name: 'Move to: NEX-108' }))
    expect(said()).toContain('Moved NEX-108 to Sprint 15.')
    expect(app.consoleErrors).toEqual([])
  })

  it('a refused Move to puts the row back, says why, and keeps focus on its Move to', async () => {
    const app = await renderApp({ path: PATH, as: 'pm', theme: 'light', size: 'phone' })
    await app.settled()
    vi.spyOn(api.tasks, 'update').mockRejectedValueOnce(new Error('That sprint is closed. Pick a planned or running one.'))
    const moveTo = screen.getByRole('button', { name: 'Move to: NEX-108' })
    moveTo.scrollIntoView({ block: 'center' })
    await userEvent.click(moveTo)
    await userEvent.click(within(screen.getByRole('menu', { name: 'Move NEX-108 to' })).getByRole('menuitem', { name: 'Sprint 15' }))
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toBe('That sprint is closed. Pick a planned or running one.'))
    await app.settled()
    expect(keysIn('Backlog')).toContain('NEX-108')
    expect(document.activeElement).toBe(within(section('Backlog')).getByRole('button', { name: 'Move to: NEX-108' }))
    expect(said().join(' ')).not.toContain('Moved NEX-108')
    vi.restoreAllMocks()
  })
})

// Sprints final review: the Board opens on the running sprint, so a task made there starts in it and stays in view.
describe('a new task on the Board (sprints spec §6.3)', () => {
  it('made on Sprint 14’s Board, it’s in Sprint 14 and shows on the Board', async () => {
    const app = await renderApp({ path: '/w/engineering/p/NEX/tasks?view=board', as: 'pm', theme: 'light', size: 'desktop' })
    await app.settled()
    expect((screen.getByRole('combobox', { name: 'Sprint' }) as HTMLSelectElement).value).toBe('s-nex-1')
    await userEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'New task' }))
    const sheet = await screen.findByRole('dialog', { name: 'New task' })
    expect((within(sheet).getByRole('combobox', { name: 'Sprint' }) as HTMLSelectElement).value).toBe('s-nex-1')
    await userEvent.fill(within(sheet).getByRole('textbox', { name: /^Title/ }), 'Rotate the signing keys')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save task' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New task' })).toBeNull())
    await app.settled()
    const made = (await api.tickets.list('p-nex')).find((t) => t.title === 'Rotate the signing keys')!
    expect(made.sprintId).toBe('s-nex-1')
    const onBoard = screen.getAllByRole('region', { name: /: \d+ tasks?$/ }).flatMap((column) => within(column).queryAllByRole('link', { name: new RegExp(made.key) }))
    expect(onBoard).toHaveLength(1)
    expect(app.consoleErrors).toEqual([])
  })
})
