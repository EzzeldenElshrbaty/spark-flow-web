import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { api } from '@/lib/api'
import { renderApp } from '@/test/app'

// UX Phase 6, 6.4: the polish items, in the whole app.

describe('arrow keys move a choice without filling Back', () => {
  it('the Tasks tab’s Board | List: an arrow replaces the entry, a click adds one', async () => {
    const app = await renderApp({ path: '/w/engineering/p/NEX/tasks?view=board', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    screen.getByRole('radio', { name: 'Board' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(app.router.state.location.search).toContain('view=list'))
    expect(app.router.state.historyAction).toBe('REPLACE')
    await userEvent.click(screen.getByRole('radio', { name: 'Board' }))
    await waitFor(() => expect(app.router.state.location.search).toContain('view=board'))
    expect(app.router.state.historyAction).toBe('PUSH')
  })

  it('Activity’s tabs', async () => {
    const app = await renderApp({ path: '/w/engineering/activity', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    screen.getByRole('tab', { name: /^All/ }).focus()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(app.router.state.location.search).toContain('tab=mention'))
    expect(app.router.state.historyAction).toBe('REPLACE')
  })

  it('Time & cost’s period', async () => {
    const app = await renderApp({ path: '/w/engineering/time', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    screen.getByRole('radio', { name: '7 days' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(app.router.state.location.search).toContain('days=30'))
    expect(app.router.state.historyAction).toBe('REPLACE')
  })
})

describe('polish', () => {
  it('Manage phases says when a phase is added', async () => {
    const app = await renderApp({ path: '/w/engineering/p/NEX/overview', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await userEvent.click(within(screen.getByRole('main')).getByRole('button', { name: 'More actions' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Manage phases' }))
    const dialog = await screen.findByRole('dialog', { name: 'Manage phases' })
    await userEvent.fill(within(dialog).getByRole('textbox', { name: 'New phase name' }), 'Hardening')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add phase' }))
    expect(await screen.findByText('Phase added.')).toBeTruthy()
  })

  it('on a phone the channel’s name stays tappable beside the star', async () => {
    const app = await renderApp({ path: '/w/engineering/c/c-general', as: 'admin', theme: 'light', size: 'phone' })
    await app.settled()
    const name = within(screen.getByRole('heading', { level: 1 })).getByRole('button')
    const box = name.getBoundingClientRect()
    expect(document.elementFromPoint(box.right - 2, box.top + box.height / 2)?.closest('button')).toBe(name)
  })

  // Since the phone bookmark row (follow-up to Phase 6) the row ends with a bookmark, and + is in Channel actions.
  it('on a phone the bookmark row scrolls no further than its content (no touch area past its end)', async () => {
    const app = await renderApp({ path: '/w/engineering/c/c-general', as: 'admin', theme: 'light', size: 'phone' })
    await app.settled()
    // Enough to scroll sideways.
    for (let n = 1; n <= 6; n++) await api.bookmarks.add('c-general', { title: `Runbook ${n}`, url: `https://wiki.spark-sys.com/runbook-${n}` })
    await app.queryClient.invalidateQueries()
    const last = (await screen.findByRole('link', { name: 'Runbook 6' })).closest('li')!
    const strip = last.closest('ul')!.parentElement!
    expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth)
    const box = strip.getBoundingClientRect()
    const content = last.getBoundingClientRect().right - box.left + strip.scrollLeft + parseFloat(getComputedStyle(strip).paddingInlineEnd)
    expect(strip.scrollWidth).toBeLessThanOrEqual(Math.ceil(content))
    expect(last.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })

  it('a late due date stays on one line in the Projects table', async () => {
    const app = await renderApp({ path: '/w/engineering/projects', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    const late = screen.getAllByText(/· late$/)[0]!
    expect(getComputedStyle(late).whiteSpace).toBe('nowrap')
    expect(late.getBoundingClientRect().height).toBeLessThanOrEqual(parseFloat(getComputedStyle(late).lineHeight) + 1)
  })

  it('on a phone, what Tab reaches isn’t hidden under the top bar and the sticky filter row', async () => {
    const app = await renderApp({ path: '/w/engineering/projects', as: 'admin', theme: 'light', size: 'phone' })
    await app.settled()
    const bar = document.querySelector('main .sticky') as HTMLElement
    const stack = 56 + bar.getBoundingClientRect().height
    expect(parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)).toBeGreaterThanOrEqual(stack)
  })

  it('on a laptop, the page column keeps what Tab reaches clear of the sticky filter row', async () => {
    const app = await renderApp({ path: '/w/engineering/projects', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    const bar = document.querySelector('main .sticky') as HTMLElement
    const column = screen.getByRole('main').parentElement!
    expect(getComputedStyle(column).overflowY).toBe('auto')
    expect(parseFloat(getComputedStyle(column).scrollPaddingTop)).toBeGreaterThanOrEqual(bar.getBoundingClientRect().height)
  })

  it('a jump to a section lands just under the sticky rows, not lower (UX Phase 6, final review)', async () => {
    const app = await renderApp({ path: '/w/engineering/dashboard', as: 'admin', theme: 'light', size: 'phone' })
    await app.settled()
    const target = document.getElementById('attention')!
    target.scrollIntoView()
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
    expect(target.getBoundingClientRect().top).toBeLessThanOrEqual(padding + 2)
  })
})

