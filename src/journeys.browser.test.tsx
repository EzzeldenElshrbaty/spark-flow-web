import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { api } from '@/lib/api'
import { focusEditor } from '@/pages/chat/composer/focusEditor.testkit'
import { renderApp, type AppHandle, type Size, type Theme } from '@/test/app'

// UX Phase 6, 6.2: each role's walkthrough from the audit, as a test, on a laptop in light and on a phone in dark.
// Each starts from fresh seed data; every step checks what the person would see.

const SETUPS: [Size, Theme][] = [
  ['desktop', 'light'],
  ['phone', 'dark'],
]

beforeEach(async () => {
  // A fresh seed, as the Admin (the only one who may reset it); renderApp then signs in whoever the walkthrough is.
  // Whoever the last walkthrough signed in (the mock acts as them) signs out first.
  await api.auth.signOut().catch(() => {})
  localStorage.setItem('spark-flow.session', 'u-1')
  await api.db.reset()
  // Starting a timer asks where the browser is; here it says no at once instead of waiting for a prompt.
  vi.spyOn(navigator.geolocation, 'getCurrentPosition').mockImplementation((_ok, fail) => fail?.({ code: 1, message: 'Denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError))
  return () => vi.restoreAllMocks()
})

const shown = (el: Element) => {
  const box = el.getBoundingClientRect()
  return box.width > 0 && box.height > 0
}

/** The one control with this name a person can see (a phone hides the laptop's, and the other way round). */
async function seen(role: 'button' | 'link' | 'combobox' | 'textbox', name: string | RegExp, scope: HTMLElement = document.body) {
  let found: HTMLElement | undefined
  await waitFor(() => {
    found = within(scope).getAllByRole(role, { name }).find(shown)
    expect(found, `${role} ${String(name)}`).toBeTruthy()
  })
  return found!
}

const press = async (role: 'button' | 'link', name: string | RegExp, scope?: HTMLElement) => userEvent.click(await seen(role, name, scope))
const dialog = (name: string | RegExp) => screen.findByRole('dialog', { name })
const said = (text: string | RegExp) => screen.findByText(text, {}, { timeout: 5000 })

/** Moves to `path` and waits for its heading: while the next page's code loads, the last page stays on screen. */
async function go(app: AppHandle, path: string, heading: string) {
  await app.router.navigate(path)
  await screen.findByRole('heading', { level: 1, name: heading }, { timeout: 10_000 })
  await app.settled()
}

/** The timer as it shows at this size: the top bar's pill on a laptop, the bar above the bottom bar on a phone. */
const timer = (size: Size) => document.querySelector<HTMLElement>(size === 'phone' ? '[data-timer="bar"]' : '[data-timer="pill"]')

describe.each(SETUPS)('Member (Mariam) at %s in %s', (size, theme) => {
  it('signs in, times NEX-106, comments with a file, moves it, stops, fixes a wrong entry, and reads #general’s page', async () => {
    // #general's page, written before she signs in (chat spec 6.14); nobody is editing it now.
    await api.pages.save('c-general', {
      body: [
        { type: 'h2', children: [{ type: 'text', text: 'Launch checklist' }] },
        { type: 'check', items: [{ checked: false, children: [{ type: 'text', text: 'Book the venue' }] }] },
      ],
      baseVersion: 0,
    })
    await api.pages.stopEditing('c-general')
    const app = await renderApp({ path: '/signin', as: null, theme, size })
    await app.settled()
    await press('button', /^Mariam Fathy/)
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    await app.settled()

    // The seed has her timer running since an hour ago: she stops it, then starts it again from Start timer.
    await waitFor(() => expect(timer(size)?.textContent).toContain('NEX-106'))
    await userEvent.click(within(timer(size)!).getByRole('button', { name: 'Stop' }))
    await press('button', 'Start timer')
    const start = await dialog('Start timer')
    await userEvent.fill(within(start).getByRole('combobox', { name: 'Find a task' }), 'NEX-106')
    await userEvent.click(await within(start).findByRole('option', { name: /^NEX-106/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Start timer' })).toBeNull())
    await waitFor(() => expect(timer(size)?.textContent).toContain('NEX-106'))

    // A comment with a file, in the task's panel.
    await go(app, '/w/engineering/p/NEX/tasks?ticket=NEX-106', 'Nexus Core')
    const panel = size === 'phone' ? await dialog('Task') : await screen.findByRole('complementary', { name: 'Task' })
    await userEvent.click(within(panel).getByRole('tab', { name: /^Comments/ }))
    await userEvent.fill(await within(panel).findByRole('combobox', { name: 'Write a comment' }), 'Checked on staging, notes attached.')
    await userEvent.upload(within(panel).getByLabelText('Add images, video or files (up to 5)'), new File(['steps'], 'notes.txt', { type: 'text/plain' }))
    await userEvent.click(within(panel).getByRole('button', { name: 'Post comment' }))
    expect(await within(panel).findByText('Checked on staging, notes attached.')).toBeTruthy()
    expect(await within(panel).findByRole('button', { name: /^notes\.txt/ })).toBeTruthy()

    // She moves it on, and stops the timer from the panel (on a phone the panel covers the timer bar).
    await userEvent.click(within(panel).getByRole('tab', { name: 'Details' }))
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Status' }), 'In progress')
    await waitFor(() => expect((within(panel).getByRole('combobox', { name: 'Status' }) as HTMLSelectElement).value).toBe('inProgress'))
    await userEvent.click(await within(panel).findByRole('button', { name: 'Stop' }))
    await waitFor(() => expect(timer(size)).toBeNull())

    // A wrong entry, fixed: her oldest one ends 30 minutes earlier.
    await go(app, '/w/engineering/p/NEX/time', 'Nexus Core')
    const menus = (await screen.findAllByRole('button', { name: 'Entry actions' })).filter(shown)
    await userEvent.click(menus.at(-1)!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit entry' }))
    const edit = await dialog('Edit entry')
    const end = within(edit).getByLabelText(/^End/) as HTMLInputElement
    const [h, m] = end.value.split(':').map(Number)
    const earlier = h! * 60 + m! - 30
    await userEvent.fill(end, `${String(Math.floor(earlier / 60)).padStart(2, '0')}:${String(earlier % 60).padStart(2, '0')}`)
    await userEvent.click(within(edit).getByRole('button', { name: 'Save' }))
    expect(await said('Time entry saved.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit entry' })).toBeNull())

    // #general's page: its heading under the channel's name, and the checklist with its state.
    await app.router.navigate('/w/engineering/c/c-general?tab=page')
    expect(await screen.findByRole('heading', { level: 3, name: 'Launch checklist' }, { timeout: 10_000 })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Book the venue' }).getAttribute('aria-checked')).toBe('false')
  }, 90_000)
})

describe.each(SETUPS)('PM (Nour) at %s in %s', (size, theme) => {
  it('creates a task with a description and a file, cancels by mistake, assigns it, adds time for Mariam, reads the Dashboard, starts #general’s page', async () => {
    const app = await renderApp({ path: '/w/engineering/p/NEX/tasks', as: 'pm', theme, size })
    await app.settled()
    await press('button', 'New task', screen.getByRole('main'))
    const sheet = await dialog('New task')
    await userEvent.fill(within(sheet).getByRole('textbox', { name: 'Title' }), 'Walkthrough task')
    const description = await within(sheet).findByRole('textbox', { name: 'Description' })
    await focusEditor(description)
    await userEvent.keyboard('Steps to check')
    await userEvent.upload(within(sheet).getByRole('region', { name: 'Attachments' }).querySelector('input[type="file"]')!, new File(['plan'], 'plan.txt', { type: 'text/plain' }))
    expect(await within(sheet).findByRole('button', { name: /Remove plan\.txt/ })).toBeTruthy()

    // Cancel by mistake: it asks, and Keep editing keeps everything.
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    expect(within(sheet).getByText('Discard this new task?')).toBeTruthy()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Keep editing' }))
    expect((within(sheet).getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Walkthrough task')
    await waitFor(() => expect((within(sheet).getByRole('button', { name: 'Save task' }) as HTMLButtonElement).disabled).toBe(false))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save task' }))
    expect(await said('Task NEX-111 created.')).toBeTruthy()

    // Assign it to Mariam from the panel's Edit task.
    await app.settled()
    await press('button', 'Edit task')
    const edit = await dialog('Edit task')
    await userEvent.selectOptions(within(edit).getByRole('combobox', { name: 'Assignee' }), 'Mariam Fathy')
    await userEvent.click(within(edit).getByRole('button', { name: 'Save task' }))
    expect(await said('Task NEX-111 saved.')).toBeTruthy()

    // An hour for Mariam, on a day nobody logged.
    await go(app, '/w/engineering/p/NEX/time', 'Nexus Core')
    await press('button', 'Add time', screen.getByRole('main'))
    const add = await dialog('Add time')
    await userEvent.selectOptions(within(add).getByRole('combobox', { name: 'Person' }), 'Mariam Fathy')
    const day = new Date(Date.now() - 12 * 86_400_000)
    await userEvent.fill(within(add).getByLabelText(/^Day/), `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`)
    await userEvent.fill(within(add).getByLabelText(/^Start/), '09:00')
    await userEvent.fill(within(add).getByLabelText(/^End/), '10:00')
    await userEvent.click(within(add).getByRole('button', { name: 'Add time' }))
    expect(await said('Time added.')).toBeTruthy()
    expect((await screen.findAllByText(/Added by Nour El-Sayed/)).some(shown)).toBe(true)

    await go(app, '/w/engineering/dashboard', 'Dashboard')
    expect(await seen('link', /^NC Nexus Core/, screen.getByRole('main'))).toBeTruthy()

    // She starts #general's page (chat spec 6.14): a heading and a checklist, saved as she types.
    await app.router.navigate('/w/engineering/c/c-general?tab=page')
    const page = await screen.findByRole('textbox', { name: 'Channel page' }, { timeout: 10_000 })
    await app.settled()
    await focusEditor(page)
    await userEvent.keyboard('## Launch checklist{Enter}[[ ] Book the venue')
    await waitFor(
      async () =>
        expect((await api.pages.get('c-general')).body).toEqual([
          { type: 'h2', children: [{ type: 'text', text: 'Launch checklist' }] },
          { type: 'check', items: [{ checked: false, children: [{ type: 'text', text: 'Book the venue' }] }] },
        ]),
      { timeout: 5000 },
    )
    expect(within(screen.getByRole('group', { name: 'Page' })).getByText('Saved')).toBeTruthy()
  }, 90_000)
})

describe.each(SETUPS)('Admin (Youssef) at %s in %s', (size, theme) => {
  it('adds a person and a team, makes them a PM, checks Attendance and Time & cost, archives a project and deletes it for good', async () => {
    const app = await renderApp({ path: '/w/engineering/teams', as: 'admin', theme, size })
    await app.settled()
    await press('button', 'New team', screen.getByRole('main'))
    const team = await dialog('New team')
    await userEvent.fill(within(team).getByRole('textbox', { name: 'Name' }), 'Data')
    await userEvent.click(within(team).getByRole('button', { name: 'Add team' }))
    expect(await said('Team Data created.')).toBeTruthy()

    await go(app, '/w/engineering/settings/users', 'Users')
    await press('button', 'Add person', screen.getByRole('main'))
    const person = await dialog('Add person')
    await userEvent.fill(within(person).getByRole('textbox', { name: 'Name' }), 'Laila Samir')
    await userEvent.fill(within(person).getByRole('textbox', { name: 'Email' }), 'laila.samir@spark-sys.com')
    await userEvent.click(within(person).getByRole('checkbox', { name: 'Member' }))
    await userEvent.click(within(person).getByRole('checkbox', { name: 'Data' }))
    await userEvent.click(within(person).getByRole('button', { name: 'Add person' }))
    expect(await said('Laila Samir added.')).toBeTruthy()

    // A role changed: she's a project manager too.
    await app.settled()
    await press('button', /^Laila Samir/, screen.getByRole('main'))
    const edit = await dialog('Edit Laila Samir')
    await userEvent.click(within(edit).getByRole('checkbox', { name: 'Project manager' }))
    await userEvent.click(within(edit).getByRole('button', { name: 'Save changes' }))
    expect(await said('Changes saved.')).toBeTruthy()
    await go(app, '/w/engineering/teams', 'Teams')
    expect(await screen.findByRole('heading', { name: /^Data · 1 person/ })).toBeTruthy()

    await go(app, '/w/engineering/settings/attendance', 'Attendance')
    expect(screen.getByRole(size === 'phone' ? 'list' : 'table', { name: 'Days' })).toBeTruthy()
    await go(app, '/w/engineering/time', 'Time & cost')
    expect(screen.getByRole('heading', { level: 1, name: 'Time & cost' })).toBeTruthy()
    expect(screen.getAllByText('Hours').some(shown)).toBe(true)

    // Archive Sela booking with a reason.
    await go(app, '/w/engineering/p/SEL/overview', 'Sela booking')
    await press('button', 'More actions', screen.getByRole('main'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive project' }))
    const archive = await dialog('Archive Sela booking?')
    await userEvent.fill(within(archive).getByRole('textbox', { name: /Why/ }), 'Client paused the booking work')
    await userEvent.click(within(archive).getByRole('button', { name: 'Archive project' }))
    expect(await said('This project is archived.')).toBeTruthy()

    // Deleting for good waits out the retention (30 days at least): the test moves the archive date back a year.
    const bundle = await api.db.export()
    const data = (bundle as unknown as { data: { projects: { key: string; archivedAt?: string }[] } }).data
    data.projects.find((p) => p.key === 'SEL')!.archivedAt = new Date(Date.now() - 400 * 86_400_000).toISOString()
    await api.db.import(bundle)
    await go(app, '/w/engineering/settings/archived', 'Archived records')
    await press('button', 'Delete Sela booking for good')
    const remove = await dialog('Delete Sela booking for good?')
    const confirm = within(remove).getByRole('button', { name: 'Delete for good' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    await userEvent.fill(within(remove).getByRole('textbox', { name: 'Type SEL to confirm' }), 'SEL')
    await waitFor(() => expect(confirm.disabled).toBe(false))
    await userEvent.click(confirm)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete Sela booking for good?' })).toBeNull())
    await waitFor(() => expect(within(screen.getByRole('main')).queryAllByText('Sela booking').filter(shown)).toEqual([]))
  }, 90_000)
})

describe.each(SETUPS)('Sales (Karim) at %s in %s', (size, theme) => {
  it('creates a project, finds it on the Dashboard and opens its Overview', async () => {
    const app = await renderApp({ path: '/w/engineering/projects', as: 'sales', theme, size })
    await app.settled()
    await press('button', 'New project', screen.getByRole('main'))
    const sheet = await dialog('New project')
    await userEvent.fill(within(sheet).getByRole('textbox', { name: 'Name' }), 'Atlas portal')
    const manager = within(sheet).getByRole('combobox', { name: 'Project manager' }) as HTMLSelectElement
    await userEvent.selectOptions(manager, [...manager.options].find((o) => o.textContent?.startsWith('Nour El-Sayed'))!)
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save project' }))
    expect(await said('Project Atlas portal created.')).toBeTruthy()
    await screen.findByRole('heading', { level: 1, name: 'Atlas portal' })
    const overview = app.router.state.location.pathname

    await go(app, '/w/engineering/dashboard', 'Dashboard')
    await press('link', /Atlas portal/, screen.getByRole('main'))
    await screen.findByRole('heading', { level: 1, name: 'Atlas portal' })
    expect(app.router.state.location.pathname).toBe(overview)
  }, 90_000)
})
