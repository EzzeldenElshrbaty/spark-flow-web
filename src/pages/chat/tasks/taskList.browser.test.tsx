import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { api } from '@/lib/api'
import { axeProblems } from '@/test/axe'
import { renderApp } from '@/test/app'
import { answersTouch } from '@/test/touch'
import { sidewaysScroll } from '@/test/uxChecks'
import { focusEditor } from '@/pages/chat/composer/focusEditor.testkit'

// A channel's task list (task list spec §5): #frontend-dev's seeded list holds MOB-103 (late), NEX-105, NEX-106 (by due
// date) and, done, NEX-103.

// Start from a fresh seed, as the Admin, the only one who may reset it.
beforeEach(async () => {
  await api.auth.signOut().catch(() => {})
  localStorage.setItem('spark-flow.session', 'u-1')
  await api.db.reset()
})

const LIST = '/w/engineering/c/c-frontend?tab=tasks'
const list = () => screen.getByRole('list', { name: 'Task list' })
const titles = () => within(list()).getAllByRole('link').map((a) => a.textContent)
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
/** What a person clicks: the checkbox's visible box (its label). */
const tickBox = (name: string) => box(name).closest('label')!
const MOB_103 = 'Add biometric unlock for Face ID and fingerprint'
const NEX_106 = 'Show an unread badge in the channel list'
const NEX_105 = 'Board: drag a card to change its status'
const category = async (key: string) => (await api.tickets.get(key)).category

describe('the Task list tab', () => {
  it('shows #frontend-dev’s list: open tasks by due date, Done folded, the project with each, a count on the tab', async () => {
    const app = await renderApp({ path: '/w/engineering/c/c-frontend', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await userEvent.click(await screen.findByRole('tab', { name: 'Task list 3' }))
    await app.settled()
    expect(titles()).toEqual([MOB_103, NEX_105, NEX_106])
    expect(screen.getByText('3 open · 1 done')).toBeTruthy()
    const fold = screen.getByRole('button', { name: 'Done · 1' })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(fold)
    expect(screen.getByRole('checkbox', { name: 'Reopen NEX-103' })).toBeTruthy()
    expect(within(list()).getAllByText('MOB').length).toBeGreaterThan(0)
  })

  it('opens a task in the panel from its title, keeping the tab', async () => {
    const app = await renderApp({ path: LIST, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await userEvent.click(screen.getByRole('link', { name: MOB_103 }))
    await screen.findByRole('complementary', { name: 'Task' })
    const search = new URLSearchParams(app.router.state.location.search)
    expect(search.get('tab')).toBe('tasks')
    expect(search.get('ticket')).toBe('MOB-103')
  })

  it('ticking moves a task to its project’s first Done column, even on a board of its own; unticking to To do', async () => {
    const app = await renderApp({ path: LIST, as: 'pm', theme: 'light', size: 'desktop' })
    // NEX's board gets a second Done column before the standard one: ticking lands in it (Review Focus 1).
    const board = await api.projects.addColumn('p-nex', { label: 'Shipped', category: 'done', after: 'inReview' })
    const shipped = board.board!.find((c) => c.label === 'Shipped')!.id
    await app.settled()
    await userEvent.click(tickBox('Mark NEX-106 done'))
    await waitFor(async () => expect((await api.tickets.get('NEX-106')).status).toBe(shipped))
    await userEvent.click(await screen.findByRole('button', { name: 'Done · 2' }))
    await userEvent.click(tickBox('Reopen NEX-106'))
    await waitFor(async () => expect((await api.tickets.get('NEX-106')).status).toBe('todo'))
  })

  it('a double click makes one move (Review Focus 3)', async () => {
    const app = await renderApp({ path: LIST, as: 'pm', theme: 'light', size: 'desktop' })
    await app.settled()
    await userEvent.dblClick(tickBox('Mark NEX-106 done'))
    await app.settled()
    expect(await category('NEX-106')).toBe('done')
  })

  it('Remove from list takes the row away and leaves the task', async () => {
    const app = await renderApp({ path: LIST, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await userEvent.click(screen.getByRole('button', { name: 'Task actions for NEX-105' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Remove from list/ }))
    await waitFor(() => expect(titles()).toEqual([MOB_103, NEX_106]))
    expect((await api.tickets.get('NEX-105')).archivedAt ?? null).toBeNull()
  })

  it('a channel with an empty list has no tab until the address asks for it', async () => {
    const app = await renderApp({ path: '/w/engineering/c/c-backend', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(screen.queryByRole('tab', { name: /Task list/ })).toBeNull()
    await app.router.navigate('/w/engineering/c/c-backend?tab=tasks')
    await app.settled()
    expect(screen.getByRole('tab', { name: 'Task list' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('No tasks on this list yet.')).toBeTruthy()
  })

  it('someone who can’t post gets no adding or removing; each checkbox follows its own task (Review Focus 4)', async () => {
    await api.chat.updateChannel('c-frontend', { whoCanPost: 'admins' })
    const app = await renderApp({ path: LIST, as: 'member', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Task actions for NEX-105' }))
    expect(await screen.findByRole('menuitem', { name: /Open task/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /Remove from list/ })).toBeNull()
    await userEvent.keyboard('{Escape}')
    // Mariam has NEX-106; MOB-103 is Ahmed's, on a project she doesn't manage.
    expect(box('Mark NEX-106 done').disabled).toBe(false)
    expect(box('Mark MOB-103 done').disabled).toBe(true)
  })

  it('isn’t in a project’s own Chat tab: the project’s Tasks tab is there', async () => {
    const app = await renderApp({ path: '/w/engineering/p/NEX/chat', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(screen.queryByRole('tab', { name: /Task list/ })).toBeNull()
  })

  it('on a phone in dark: two-line rows that wrap a long title, 44px touches, nothing sideways (Review Focus 5)', async () => {
    await api.tasks.update('NEX-105', { title: 'Board: drag a card to change its status, keep the focus ring on every column, and say the new column after each move' })
    const app = await renderApp({ path: LIST, as: 'admin', theme: 'dark', size: 'phone' })
    await app.settled()
    expect(sidewaysScroll()).toBeNull()
    for (const el of [box('Mark NEX-105 done').closest('label')!, screen.getByRole('button', { name: 'Task actions for NEX-105' })])
      expect(answersTouch(el)).toEqual([true, true, true, true])
    expect(await axeProblems(document)).toEqual([])
  })

  it('works from the keyboard: the checkbox, the title and ⋯ in that order; Space ticks', async () => {
    const app = await renderApp({ path: LIST, as: 'pm', theme: 'light', size: 'desktop' })
    await app.settled()
    // Nour doesn't manage MOB: its checkbox is off, so start from NEX-106's.
    box('Mark NEX-106 done').focus()
    expect(document.activeElement).toBe(box('Mark NEX-106 done'))
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('link', { name: NEX_106 }))
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Task actions for NEX-106' }))
    await userEvent.tab({ shift: true })
    await userEvent.tab({ shift: true })
    await userEvent.keyboard(' ')
    await waitFor(async () => expect(await category('NEX-106')).toBe('done'))
  })
})

describe('adding tasks to the list (task list §6)', () => {
  it('+ Task list in a channel’s box opens its Task list tab', async () => {
    const app = await renderApp({ path: '/w/engineering/c/c-backend', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await userEvent.click(screen.getByRole('button', { name: 'Attach' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Task list/ }))
    await app.settled()
    expect(new URLSearchParams(app.router.state.location.search).get('tab')).toBe('tasks')
    expect(screen.getByText('No tasks on this list yet.')).toBeTruthy()
  })

  it('Add an existing task adds what I pick, once, however fast I pick it (Review Focus 3)', async () => {
    const app = await renderApp({ path: LIST, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await userEvent.click(screen.getByRole('button', { name: 'Add an existing task' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add an existing task' })
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Find a task' }), 'audit log')
    const pick = await within(dialog).findByRole('button', { name: /^NEX-110 / })
    await userEvent.dblClick(pick)
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /^NEX-110 .* · On the list$/ })).toBeTruthy())
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    await app.settled()
    expect((await api.taskLists.get('c-frontend')).entries.filter((e) => e.task.key === 'NEX-110')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Audit log for workspace role changes' })).toBeTruthy()
  })

  it('New task on the tab makes the task and puts it on the list', async () => {
    const app = await renderApp({ path: LIST, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await userEvent.click(screen.getByRole('button', { name: 'New task' }))
    await userEvent.type(await screen.findByRole('textbox', { name: /Title/ }), 'Keep the list in order')
    await userEvent.click(screen.getByRole('button', { name: /Save task/ }))
    await app.settled()
    expect(await screen.findByRole('link', { name: 'Keep the list in order' })).toBeTruthy()
  })

  it('/task in a channel puts the new task on its list, and the tab appears', async () => {
    const app = await renderApp({ path: '/w/engineering/c/c-backend', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(screen.queryByRole('tab', { name: /Task list/ })).toBeNull()
    await focusEditor(screen.getByRole('textbox', { name: /Message #backend/ }))
    await userEvent.keyboard('/task Rotate the queue keys')
    await userEvent.keyboard('{Enter}')
    await userEvent.click(await screen.findByRole('button', { name: /Save task/ }))
    await app.settled()
    expect(await screen.findByRole('tab', { name: 'Task list 1' })).toBeTruthy()
    expect((await api.taskLists.get('c-backend')).entries.map((e) => e.task.title)).toEqual(['Rotate the queue keys'])
  })
})
