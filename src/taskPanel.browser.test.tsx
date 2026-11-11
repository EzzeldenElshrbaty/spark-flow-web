import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { api } from '@/lib/api'
import { paths } from '@/lib/paths'
import { useUiStore } from '@/lib/uiStore'
import { renderApp } from '@/test/app'

// The task panel shows all of a task (11 Nov 2026): every field, then its comments and history in one scroll, a way
// to the task on its project's board, and a wider panel on request.

// Start from a fresh seed, as the Admin, the only one who may reset it.
beforeEach(async () => {
  await api.auth.signOut().catch(() => {})
  localStorage.setItem('spark-flow.session', 'u-1')
  await api.db.reset()
  // The panel's size outlives a test (it's the UI store's, kept in memory too).
  useUiStore.setState({ wideTaskPanel: {} })
})

/** NEX-106: an agile task (Sprint 14, 3 points) made from a message in #frontend-dev. */
const TASK = 'NEX-106'
const panel = () => screen.getByRole('complementary', { name: 'Task' })
const row = (label: string) => within(panel()).getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement

describe('the task panel’s fields', () => {
  it('names the project, the points and the message the task was made from, each a link where it goes', async () => {
    const app = await renderApp({ path: `/w/engineering/p/NEX/tasks?ticket=${TASK}`, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(within(row('Project')).getByRole('link', { name: 'Nexus Core' }).getAttribute('href')).toBe(paths.project('engineering', 'NEX'))
    expect(row('Points').textContent).toBe('3')
    const made = within(row('Made from')).getByRole('link', { name: 'A message in #frontend-dev' })
    expect(made.getAttribute('href')).toBe(paths.message('engineering', 'c-frontend', 'm-f08'))
  })

  it('leaves Points out of a task without them', async () => {
    // SEL-101 is on a waterfall project, with no points.
    const app = await renderApp({ path: '/w/engineering/p/SEL/tasks?ticket=SEL-101', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(within(panel()).queryByText('Points', { selector: 'dt' })).toBeNull()
    expect(within(panel()).queryByText('Made from', { selector: 'dt' })).toBeNull()
  })
})

describe('one scroll, no tabs', () => {
  it('shows the details, the comments and the history together', async () => {
    // NEX-101 has one comment from Youssef.
    const app = await renderApp({ path: '/w/engineering/p/NEX/tasks?ticket=NEX-101', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(within(panel()).queryByRole('tablist')).toBeNull()
    expect(row('Status')).toBeTruthy()
    expect(within(panel()).getByRole('heading', { level: 3, name: 'Comments · 1' })).toBeTruthy()
    expect(within(panel()).getByText('Approved once the 30-second window test passes.')).toBeTruthy()
    expect(within(panel()).getByRole('heading', { level: 3, name: 'History' })).toBeTruthy()
  })
})

describe('Open in project', () => {
  it('goes from a channel to the task on its project’s board, with the panel open', async () => {
    const app = await renderApp({ path: `/w/engineering/c/c-frontend?ticket=${TASK}`, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    const link = within(panel()).getByRole('link', { name: 'Open in project' })
    expect(link.getAttribute('href')).toBe(`${paths.project('engineering', 'NEX', 'tasks')}?ticket=${TASK}`)
  })

  it('isn’t offered on that board already', async () => {
    const app = await renderApp({ path: `/w/engineering/p/NEX/tasks?ticket=${TASK}`, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(within(panel()).queryByRole('link', { name: 'Open in project' })).toBeNull()
  })
})

describe('Expand panel', () => {
  it('widens the task panel over the page, and it opens wide again next time', async () => {
    const path = `/w/engineering/p/NEX/tasks?ticket=${TASK}`
    const app = await renderApp({ path, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    const main = document.querySelector('main')!
    const pageWidth = main.getBoundingClientRect().width
    expect(panel().getBoundingClientRect().width).toBeLessThan(400)
    await userEvent.click(within(panel()).getByRole('button', { name: 'Expand panel' }))
    // Wide, it covers the page as a dialog, so the page keeps its width (its top bar isn't squeezed).
    const wide = await screen.findByRole('dialog', { name: 'Task' })
    expect(wide.getBoundingClientRect().width).toBeGreaterThan(600)
    expect(screen.queryByRole('complementary', { name: 'Task' })).toBeNull()
    expect(document.querySelector('main')!.getBoundingClientRect().width).toBeGreaterThanOrEqual(pageWidth)

    await userEvent.click(within(wide).getByRole('button', { name: 'Close task' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Task' })).toBeNull())
    await app.router.navigate(path)
    await app.settled()
    expect((await screen.findByRole('dialog', { name: 'Task' })).getBoundingClientRect().width).toBeGreaterThan(600)
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Task' })).getByRole('button', { name: 'Shrink panel' }))
    await waitFor(() => expect(panel().getBoundingClientRect().width).toBeLessThan(400))
  })

  it('takes the whole screen on a phone', async () => {
    const app = await renderApp({ path: `/w/engineering/p/NEX/tasks?ticket=${TASK}`, as: 'admin', theme: 'light', size: 'phone' })
    await app.settled()
    const sheet = screen.getByRole('dialog', { name: 'Task' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Expand panel' }))
    await waitFor(() => expect(Math.round(sheet.getBoundingClientRect().height)).toBe(window.innerHeight))
  })
})

describe('the description comes first', () => {
  it('sits in its own box above the fields, with the task’s files', async () => {
    const app = await renderApp({ path: `/w/engineering/p/NEX/tasks?ticket=${TASK}`, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    const box = within(panel()).getByRole('region', { name: 'Description' })
    expect(box.textContent).toContain('Cap it at 99+')
    // Before the fields: Status follows it.
    expect(box.compareDocumentPosition(row('Status')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
