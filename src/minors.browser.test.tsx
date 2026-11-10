import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { api, ApiError } from '@/lib/api'
import { renderApp } from '@/test/app'

// UX Phase 6, D9: earlier phases' deferred minors, in the whole app.

afterEach(() => {
  vi.restoreAllMocks()
})

describe('stale filters in the address (#14)', () => {
  it('an unknown assignee on the Tasks tab is dropped from the address and reads Anyone', async () => {
    const app = await renderApp({ path: '/w/engineering/p/NEX/tasks?view=list&assignee=u-nobody', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await waitFor(() => expect(app.router.state.location.search).not.toContain('assignee'))
    expect(app.router.state.historyAction).toBe('REPLACE')
  })

  it('History: an unknown person is dropped from the address', async () => {
    const app = await renderApp({ path: '/w/engineering/p/NEX/history?who=u-nobody', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    await waitFor(() => expect(app.router.state.location.search).not.toContain('who'))
  })

  it('History: someone with nothing here is still the chosen person, and the empty text names them', async () => {
    const app = await renderApp({ path: '/w/engineering/p/NEX/history?who=u-9', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    expect((screen.getByRole('combobox', { name: 'Person' }) as HTMLSelectElement).selectedOptions[0]!.textContent).toBe('Karim Hassan')
    expect(await screen.findByText('Nothing by Karim Hassan here yet.')).toBeTruthy()
  })
})

describe('counts before they’re known (#15)', () => {
  it('the Tasks tab says no "0 tasks" while its tasks load', async () => {
    vi.spyOn(api.tickets, 'list').mockImplementation(() => new Promise(() => {}))
    await renderApp({ path: '/w/engineering/p/NEX/tasks?view=list', as: 'admin', theme: 'light', size: 'desktop' })
    await screen.findByRole('heading', { level: 1, name: 'Nexus Core' })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(document.body.textContent).not.toContain('0 tasks')
  })

  it('Projects says no "0 archived projects" while they load', async () => {
    const app = await renderApp({ path: '/w/engineering/projects', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    vi.spyOn(api.projects, 'list').mockImplementation(() => new Promise(() => {}))
    await userEvent.click(screen.getByRole('button', { name: 'Show archived' }))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(document.body.textContent).not.toContain('0 archived projects')
  })

  it('My work’s tiles show a dash, not 0, when the tasks didn’t load', async () => {
    vi.spyOn(api.tickets, 'list').mockRejectedValue(new ApiError({ status: 403, title: 'Not allowed' }))
    await renderApp({ path: '/w/engineering', as: 'member', theme: 'light', size: 'desktop' })
    await screen.findByRole('heading', { level: 1, name: 'My work' })
    await waitFor(() => expect(screen.getByText(/didn’t load/)).toBeTruthy())
    expect(screen.getByRole('button', { name: /^\S+ Overdue$/ }).textContent).toContain('–')
  })
})

describe('Back undoes a phase pick (#17)', () => {
  it('a remembered phase is written into the address on arrival, so Back after another pick returns to it', async () => {
    const app = await renderApp({ path: '/w/engineering/p/NEX/tasks?view=list', as: 'admin', theme: 'light', size: 'desktop' })
    await app.settled()
    const chips = () => within(screen.getByRole('group', { name: 'Phase' })).getAllByRole('button')
    const [, first, second] = chips()
    await userEvent.click(first!)
    await app.router.navigate('/w/engineering/p/NEX/overview')
    await app.settled()
    await app.router.navigate('/w/engineering/p/NEX/tasks?view=list')
    await app.settled()
    await waitFor(() => expect(chips()[1]!.getAttribute('aria-pressed')).toBe('true'))
    await userEvent.click(chips()[2]!)
    await waitFor(() => expect(chips()[2]!.getAttribute('aria-pressed')).toBe('true'))
    await app.router.navigate(-1)
    await waitFor(() => expect(chips()[1]!.getAttribute('aria-pressed')).toBe('true'))
    expect(second).toBeTruthy()
  })
})
