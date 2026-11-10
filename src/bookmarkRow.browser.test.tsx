import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { renderApp } from '@/test/app'
import { pageProblems } from '@/test/uxChecks'

// A channel's bookmarks on a phone, in the whole app (follow-up to UX Phase 6): Add a bookmark is in Channel actions,
// and the bookmarks get their own row under the tabs once there are some.

// The list ends with 8px of its own padding.
const atEnd = (log: HTMLElement) => log.scrollHeight - log.scrollTop - log.clientHeight <= 9

describe('bookmarks on a phone', () => {
  it('a bookmark added from Channel actions shows on its own row', async () => {
    const app = await renderApp({ path: '/w/engineering/c/c-general', as: 'admin', theme: 'dark', size: 'phone' })
    await app.settled()
    expect(screen.queryByRole('list', { name: 'Bookmarks' })).toBeNull()
    const log = screen.getByRole('log', { name: /^Messages in / })
    await waitFor(() => expect(atEnd(log)).toBe(true))

    const actions = screen.getByRole('button', { name: 'Channel actions' })
    await userEvent.click(actions)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add a bookmark' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a bookmark' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Address' }), 'wiki.spark-sys.com/runbook')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name (optional)' }), 'Runbook')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a bookmark' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(actions))
    const link = await screen.findByRole('link', { name: 'Runbook' })
    const tabs = screen.getByRole('tablist', { name: 'Channel views' }).getBoundingClientRect()
    const box = link.getBoundingClientRect()
    expect(box.top).toBeGreaterThanOrEqual(tabs.bottom)
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(390)
    await app.settled()
    expect(atEnd(screen.getByRole('log', { name: /^Messages in / }))).toBe(true)
    expect(await pageProblems(app)).toEqual([])
  })
})
