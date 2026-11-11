import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import type { Api } from '@/api/types'
import { qk } from '@/api/queryKeys'
import { api } from '@/lib/api'
import type { PageBody } from '@/lib/pageBody'
import { createMockApi } from '@/mocks'
import { memoryActor, memorySession } from '@/mocks/actor'
import { createDb } from '@/mocks/db'
import { latency } from '@/mocks/latency'
import { mockHub } from '@/mocks/realtime'
import { seed } from '@/mocks/seed'
import { openStore } from '@/mocks/store'
import { focusEditor } from '@/pages/chat/composer/focusEditor.testkit'
import { renderApp } from '@/test/app'
import { axeProblems } from '@/test/axe'
import { answersTouch } from '@/test/touch'
import { sidewaysScroll, spinners } from '@/test/uxChecks'

// The channel's Page tab (chat spec 6.14), in the whole app, as Youssef (Admin) on #general unless said otherwise.

const PAGE = '/w/engineering/c/c-general?tab=page'
const text = (t: string): PageBody => [{ type: 'p', children: [{ type: 'text', text: t }] }]

/** Someone else, in another browser: their own api on the same mock data and live events. */
async function asPerson(userId: string): Promise<Api> {
  const actor = memoryActor()
  actor.set(userId)
  return createMockApi(createDb(await openStore(indexedDB), seed, undefined, actor, memorySession(userId)), mockHub)
}

const editor = () => screen.getByRole('textbox', { name: 'Channel page' })
const bar = () => screen.getByRole('group', { name: 'Page' })

// The mock's data outlives a test file: start from a fresh seed, as the Admin, after whoever the mock acts as signs out.
beforeEach(async () => {
  await api.auth.signOut().catch(() => {})
  localStorage.setItem('spark-flow.session', 'u-1')
  await api.db.reset()
})
afterEach(() => vi.restoreAllMocks())

describe('the channel’s page (chat spec 6.14)', () => {
  it('while it loads, the tab shows pulse lines and no spinner', async () => {
    const app = await renderApp({ path: '/w/engineering/c/c-general', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    latency.min = latency.max = 600
    await userEvent.click(screen.getByRole('tab', { name: 'Page' }))
    const panel = screen.getByRole('tabpanel')
    await waitFor(() => expect(panel.querySelector('[aria-busy="true"] .animate-pulse')).not.toBeNull())
    expect(spinners()).toBe(0)
    latency.min = latency.max = 0
    await screen.findByRole('textbox', { name: 'Channel page' })
  })

  it('typing autosaves; the bar says Saving… then Saved', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(editor().getAttribute('aria-placeholder')).toBe('Start the channel’s page…')
    await focusEditor(editor())
    await userEvent.keyboard('Launch plan')
    await waitFor(() => expect(bar().textContent).toContain('Saving…'), { timeout: 3000 })
    await waitFor(() => expect(bar().textContent).toContain('Saved'), { timeout: 3000 })
    const view = await api.pages.get('c-general')
    expect(view.body).toEqual(text('Launch plan'))
  })

  it('someone else’s hold makes the page read-only with their name, and their saves show', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    const nour = await asPerson('u-2')
    await nour.pages.editing('c-general')
    await waitFor(() => expect(bar().textContent).toContain('Nour El-Sayed is editing'), { timeout: 3000 })
    expect(screen.queryByRole('textbox', { name: 'Channel page' })).toBeNull()
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull()
    await nour.pages.save('c-general', { body: text('From Nour'), baseVersion: 0 })
    expect(await screen.findByText('From Nour')).toBeTruthy()
  })

  it('after my idle minute, someone else’s claim turns my editor read-only before I save', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    await waitFor(() => expect(bar().textContent).toContain('Saved'), { timeout: 3000 })
    // My hold ends (a minute without typing), and Nour starts.
    await api.pages.stopEditing('c-general')
    const nour = await asPerson('u-2')
    await nour.pages.editing('c-general')
    await waitFor(() => expect(bar().textContent).toContain('Nour El-Sayed is editing'), { timeout: 3000 })
    expect(screen.queryByRole('textbox', { name: 'Channel page' })).toBeNull()
    expect(screen.getByText('Mine')).toBeTruthy()
    expect((await api.pages.get('c-general')).body).toEqual(text('Mine'))
  })

  it('Load the latest replaces my text; Copy my changes puts it on the clipboard', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    const otherTab = await asPerson('u-1')
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    // My other tab saves before this one's pause is over.
    await otherTab.pages.save('c-general', { body: text('Other tab'), baseVersion: 0 })
    await waitFor(() => expect(bar().textContent).toContain('You changed this page in another tab. Your last changes here aren’t saved.'), { timeout: 3000 })
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await userEvent.click(within(bar()).getByRole('button', { name: 'Copy my changes' }))
    expect(write).toHaveBeenCalledWith('Mine')
    await userEvent.click(within(bar()).getByRole('button', { name: 'Load the latest' }))
    await waitFor(() => expect(editor().textContent).toBe('Other tab'))
    expect(within(bar()).queryByRole('button', { name: 'Load the latest' })).toBeNull()
  })

  it('## and [ ] make a heading and a checklist; Tab moves through table cells', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await focusEditor(editor())
    // `[[` is a plain "[" to userEvent.
    await userEvent.keyboard('## Plan{Enter}[[ ] Ship{Enter}{Enter}')
    // The screen's h1 is the channel's name: a page's Heading 2 reads as a level 3 heading, in the editor too.
    expect(within(editor()).getByRole('heading', { level: 3, name: 'Plan' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Table' }))
    await userEvent.keyboard('A{Tab}B')
    await waitFor(async () =>
      expect((await api.pages.get('c-general')).body).toEqual([
        { type: 'h2', children: [{ type: 'text', text: 'Plan' }] },
        { type: 'check', items: [{ checked: false, children: [{ type: 'text', text: 'Ship' }] }] },
        { type: 'table', rows: [[[{ type: 'text', text: 'A' }], [{ type: 'text', text: 'B' }], []], [[], [], []], [[], [], []]] },
      ]),
      { timeout: 3000 },
    )
  })

  it('the table menu stops at 10 columns and says why (polish pass)', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await focusEditor(editor())
    await userEvent.click(screen.getByRole('button', { name: 'Table' }))
    const addColumn = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Table' }))
      return screen.findByRole('menuitem', { name: /^Add column after/ })
    }
    for (let n = 3; n < 10; n++) {
      await userEvent.click(await addColumn())
      await waitFor(() => expect(within(editor()).getAllByRole('columnheader')).toHaveLength(n + 1))
    }
    const item = await addColumn()
    expect(item.getAttribute('aria-disabled')).toBe('true')
    expect(item.textContent).toContain('10 columns at most')
    expect(screen.getByRole('menuitem', { name: /^Add row below/ }).getAttribute('aria-disabled')).toBeNull()
  })

  it('a reader who can’t post sees the view and No page yet.', async () => {
    await api.chat.updateChannel('c-general', { whoCanPost: 'admins' })
    const app = await renderApp({ path: PAGE, as: 'member', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(screen.getByText('No page yet.')).toBeTruthy()
    expect(screen.getByText('People who can post here can start it.')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Channel page' })).toBeNull()
    const youssef = await asPerson('u-1')
    await youssef.pages.save('c-general', { body: [{ type: 'h1', children: [{ type: 'text', text: 'Rules' }] }], baseVersion: 0 })
    expect(await screen.findByRole('heading', { level: 2, name: 'Rules' })).toBeTruthy()
  })

  it('leaving the channel with an unsaved change asks first', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    vi.spyOn(api.pages, 'save').mockRejectedValue(new TypeError('Failed to fetch'))
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    await waitFor(() => expect(bar().textContent).toContain('Couldn’t save the page. Check your connection.'), { timeout: 3000 })
    expect(within(bar()).getByRole('button', { name: 'Try again' })).toBeTruthy()
    await userEvent.click(screen.getByRole('link', { name: /^backend/ }))
    const ask = await screen.findByRole('dialog', { name: 'Leave without saving the page?' })
    await userEvent.click(within(ask).getByRole('button', { name: 'Stay' }))
    expect(app.router.state.location.pathname).toBe('/w/engineering/c/c-general')
    vi.restoreAllMocks()
  })

  it('on a phone the page doesn’t scroll sideways and toolbar buttons are 44 px', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'dark', size: 'phone' })
    await app.settled()
    expect(sidewaysScroll()).toBeNull()
    const buttons = within(screen.getByRole('toolbar', { name: 'Formatting' })).getAllByRole('button')
    for (const button of buttons) expect(answersTouch(button).every(Boolean), button.getAttribute('aria-label') ?? button.textContent ?? '').toBe(true)
    // The error's buttons too (final review).
    vi.spyOn(api.pages, 'save').mockRejectedValue(new TypeError('Failed to fetch'))
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    const retry = await within(bar()).findByRole('button', { name: 'Try again' }, { timeout: 3000 })
    expect(answersTouch(retry)).toEqual([true, true, true, true])
    vi.restoreAllMocks()
  })

  it('when someone else’s hold ends without a save, my editor comes back with my saved text (final review)', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    await waitFor(() => expect(bar().textContent).toContain('Saved'), { timeout: 3000 })
    await api.pages.stopEditing('c-general')
    const nour = await asPerson('u-2')
    await nour.pages.editing('c-general')
    await waitFor(() => expect(bar().textContent).toContain('Nour El-Sayed is editing'), { timeout: 3000 })
    await nour.pages.stopEditing('c-general')
    await waitFor(() => expect(editor().textContent).toBe('Mine'), { timeout: 3000 })
  })

  it('a failed reload in the background keeps the editor and my text (final review)', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    await waitFor(() => expect(bar().textContent).toContain('Saved'), { timeout: 3000 })
    vi.spyOn(api.pages, 'get').mockRejectedValue(new TypeError('Failed to fetch'))
    vi.spyOn(api.projects, 'list').mockRejectedValue(new TypeError('Failed to fetch'))
    await Promise.all([app.queryClient.refetchQueries({ queryKey: qk.page('c-general') }), app.queryClient.refetchQueries({ queryKey: ['tickets', 'projects'] })])
    await waitFor(() => expect(app.queryClient.getQueryState(qk.page('c-general'))?.status).toBe('error'), { timeout: 8000 })
    expect(editor().textContent).toBe('Mine')
    expect(screen.queryByText('Couldn’t load the page.')).toBeNull()
    vi.restoreAllMocks()
  }, 15_000)

  it('switching to Messages with a change the page doesn’t have asks first (final review)', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    vi.spyOn(api.pages, 'save').mockRejectedValue(new TypeError('Failed to fetch'))
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    await waitFor(() => expect(bar().textContent).toContain('Couldn’t save the page.'), { timeout: 3000 })
    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }))
    const ask = await screen.findByRole('dialog', { name: 'Leave without saving the page?' })
    await userEvent.click(within(ask).getByRole('button', { name: 'Stay' }))
    expect(app.router.state.location.search).toContain('tab=page')
    expect(editor().textContent).toBe('Mine')
    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Leave without saving the page?' })).getByRole('button', { name: 'Leave without saving' }))
    await waitFor(() => expect(app.router.state.location.search).not.toContain('tab=page'))
    vi.restoreAllMocks()
  })

  it('Link a task before clicking into the page puts @ at the end; @ then still finds people (final review)', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await userEvent.click(screen.getByRole('button', { name: 'Link a task' }))
    const tasks = await screen.findByRole('listbox', { name: 'Link a task' })
    expect(within(tasks).getAllByRole('option').length).toBeGreaterThan(0)
    await userEvent.keyboard('{Escape}')
    await userEvent.keyboard(' @Nou')
    const people = await screen.findByRole('listbox', { name: 'Mention someone' })
    expect(within(people).getByRole('option', { name: /Nour El-Sayed/ })).toBeTruthy()
  })

  it('a tab that never claimed the page leaves my other tab’s hold alone (polish pass)', async () => {
    const otherTab = await asPerson('u-1')
    await otherTab.pages.editing('c-general')
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await screen.findByRole('textbox', { name: 'Channel page' })
    const release = vi.spyOn(api.pages, 'stopEditing')
    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }))
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(release).not.toHaveBeenCalled()
    expect((await api.pages.get('c-general')).editing?.userId).toBe('u-1')
  })

  it('leaving after typing lets my hold go once the save has landed (polish pass)', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    await waitFor(() => expect(bar().textContent).toContain('Saved'), { timeout: 3000 })
    await userEvent.click(screen.getByRole('tab', { name: 'Messages' }))
    await waitFor(async () => expect((await api.pages.get('c-general')).editing).toBeNull(), { timeout: 3000 })
  })

  it('closing the browser tab lets my hold go when everything is saved (polish pass)', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    await waitFor(() => expect(bar().textContent).toContain('Saved'), { timeout: 3000 })
    const release = vi.spyOn(api.pages, 'stopEditing')
    dispatchEvent(new PageTransitionEvent('pagehide'))
    await waitFor(() => expect(release).toHaveBeenCalledWith('c-general'))
  })

  it('Load the latest failing says so (polish pass)', async () => {
    const app = await renderApp({ path: PAGE, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    const otherTab = await asPerson('u-1')
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    await otherTab.pages.save('c-general', { body: text('Other tab'), baseVersion: 0 })
    await waitFor(() => expect(within(bar()).getByRole('button', { name: 'Load the latest' })).toBeTruthy(), { timeout: 3000 })
    vi.spyOn(api.pages, 'get').mockRejectedValue(new TypeError('Failed to fetch'))
    await userEvent.click(within(bar()).getByRole('button', { name: 'Load the latest' }))
    await waitFor(() => expect(bar().textContent).toContain('Couldn’t load the latest page. Check your connection.'))
    expect(editor().textContent).toBe('Mine')
    vi.restoreAllMocks()
  })

  it('losing edit rights keeps my unsaved text, read-only, with Copy my changes (polish pass)', async () => {
    const made = await api.chat.createChannel({ workspaceId: 'ws-eng', name: 'launch-week', topic: '', isPrivate: false, memberIds: [] })
    const app = await renderApp({ path: `/w/engineering/c/${made.id}?tab=page`, as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    vi.spyOn(api.pages, 'save').mockRejectedValue(new TypeError('Failed to fetch'))
    await focusEditor(editor())
    await userEvent.keyboard('Mine')
    await waitFor(() => expect(bar().textContent).toContain('Couldn’t save the page.'), { timeout: 3000 })
    await api.chat.archiveChannel(made.id, 'Launch is over')
    await waitFor(() => expect(bar().textContent).toContain('You can’t edit this page anymore. Your last changes aren’t saved.'), { timeout: 3000 })
    expect(editor().textContent).toBe('Mine')
    expect(editor().getAttribute('contenteditable')).toBe('false')
    expect(within(bar()).getByRole('button', { name: 'Copy my changes' })).toBeTruthy()
    vi.restoreAllMocks()
  })

  it('axe finds no serious problems', async () => {
    await api.pages.save('c-general', {
      body: [
        { type: 'h1', children: [{ type: 'text', text: 'Plan' }] },
        { type: 'check', items: [{ checked: true, children: [{ type: 'text', text: 'Ship' }] }] },
        { type: 'table', rows: [[[{ type: 'text', text: 'A' }]], [[{ type: 'text', text: 'B' }]]] },
      ],
      baseVersion: 0,
    })
    await api.pages.stopEditing('c-general')
    for (const as of ['admin', 'member'] as const) {
      const app = await renderApp({ path: PAGE, as, theme: 'light', size: 'desktop' })
      await app.settled()
      expect(await axeProblems()).toEqual([])
    }
  })
})
