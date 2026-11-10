import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { api } from '@/lib/api'
import { renderApp, type Size, type Theme } from '@/test/app'
import { axeProblems } from '@/test/axe'
import { answersTouch } from '@/test/touch'
import { sidewaysScroll } from '@/test/uxChecks'

// A channel's intro (chat spec 6.14, second half), in the whole app, as Youssef (Admin).

beforeEach(async () => {
  await api.auth.signOut().catch(() => {})
  localStorage.setItem('spark-flow.session', 'u-1')
  await api.db.reset()
})
afterEach(() => vi.restoreAllMocks())

/** A new channel, made by Youssef, opened as him. */
async function newChannel(size: Size = 'desktop', theme: Theme = 'light') {
  const made = await api.chat.createChannel({ workspaceId: 'ws-eng', name: 'launch-week', topic: '', isPrivate: false, memberIds: [] })
  const app = await renderApp({ path: `/w/engineering/c/${made.id}`, as: 'admin', theme, size })
  await app.settled()
  await screen.findByRole('heading', { level: 2, name: /launch-week/ })
  return { app, made }
}

describe('the channel intro (chat spec 6.14)', () => {
  it('a new channel starts with the intro and its three buttons', async () => {
    await newChannel()
    expect(screen.getByText(/^You created this channel today\. This is the very beginning of #launch-week\./)).toBeTruthy()
    for (const name of ['Add people', 'Pick a template', 'Link a project', 'Add a description']) expect(screen.getByRole('button', { name })).toBeTruthy()
  })

  it('Pick a template fills the page and opens it', async () => {
    await newChannel()
    await userEvent.click(screen.getByRole('button', { name: 'Pick a template' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pick a template' })
    // The card is what a person taps (its radio is visually hidden).
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Release/ }).closest('label')!)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use template' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pick a template' })).toBeNull())
    expect(await screen.findByRole('tab', { name: 'Page', selected: true })).toBeTruthy()
    expect(await screen.findByRole('heading', { level: 3, name: 'Release checklist' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Freeze the scope' })).toBeTruthy()
  })

  it('Link a project adds a bookmark that opens the project in Flow', async () => {
    const { app } = await newChannel()
    await userEvent.click(screen.getByRole('button', { name: 'Link a project' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Nexus Core' }))
    const link = await within(await screen.findByRole('list', { name: 'Bookmarks' })).findByRole('link', { name: 'Nexus Core' })
    expect(link.getAttribute('target')).toBeNull()
    await userEvent.click(link)
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/w/engineering/p/NEX/overview'))
  })

  it('Edit description opens About editing it', async () => {
    await newChannel()
    await userEvent.click(screen.getByRole('button', { name: 'Add a description' }))
    const field = await screen.findByRole('textbox', { name: 'Description' })
    await waitFor(() => expect(document.activeElement).toBe(field))
  })

  it('a project’s channel and a DM say where they begin, with no buttons', async () => {
    let app = await renderApp({ path: '/w/engineering/p/NEX/chat', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(await screen.findByText('This is the very beginning of #nexus-core, Nexus Core’s chat.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pick a template' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Link a project' })).toBeNull()
    app = await renderApp({ path: '/w/engineering/c/c-dm-1', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect(await screen.findByText('This is the very beginning of your conversation with Nour El-Sayed.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add people' })).toBeNull()
  })

  it('on a phone the intro’s buttons answer touch and nothing scrolls sideways', async () => {
    await newChannel('phone', 'dark')
    expect(sidewaysScroll()).toBeNull()
    for (const name of ['Add people', 'Pick a template', 'Link a project', 'Add a description']) {
      expect(answersTouch(screen.getByRole('button', { name })), name).toEqual([true, true, true, true])
    }
  })

  it('axe finds no serious problems', async () => {
    for (const theme of ['light', 'dark'] as const) {
      await newChannel('desktop', theme)
      expect(await axeProblems(), theme).toEqual([])
      await api.db.reset()
    }
  })
})
