// @vitest-environment jsdom
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Preferences } from '@/api/types'
import { api, ApiError } from '@/lib/api'
import { PreferencesPage } from './PreferencesPage'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

let stored: Preferences
let update: ReturnType<typeof vi.fn>
beforeEach(() => {
  stored = {
    defaultLevel: 'mentions', keywords: ['deploy'], desktop: false, push: true, emailDigest: 'daily', dndUntil: null,
    dndSchedule: { on: false, from: '18:00', to: '09:00', days: [0, 1, 2, 3, 4], tz: 'Africa/Cairo' },
  }
  vi.spyOn(api.preferences, 'get').mockImplementation(async () => structuredClone(stored))
  update = vi.fn(async (patch: Partial<Preferences>) => (stored = { ...stored, ...patch }))
  vi.spyOn(api.preferences, 'update').mockImplementation(update as unknown as typeof api.preferences.update)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function mount() {
  const client: QueryClient = new QueryClient({ mutationCache: new MutationCache({ onSuccess: () => client.invalidateQueries() }) })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PreferencesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Preferences', level: 1 })
  await screen.findByRole('radio', { name: 'Mentions and keywords' })
}
const section = (name: string) => screen.getByRole('region', { name })

describe('Preferences in the standard look (UX Phase 3, 3.1)', () => {
  it('is a kit page like Settings: its heading, no chat scope, and kit cards', async () => {
    await mount()
    const heading = screen.getByRole('heading', { name: 'Preferences', level: 1 })
    expect(heading.closest('.sf')).toBeNull()
    expect(heading.className).toContain('text-2xl')
    for (const name of ['Notify me about', 'Keywords', 'Delivery', 'Do Not Disturb']) expect(section(name).className).toContain('rounded-xl border border-line bg-surface shadow-sm')
    expect(screen.getByRole('switch', { name: 'Mobile push' }).className).toContain('bg-brand-500')
  })
})

describe('Preferences: Notify me about (spec 6.11 global default)', () => {
  it('shows my default checked; picking another saves it', async () => {
    await mount()
    const notify = section('Notify me about')
    expect((within(notify).getByRole('radio', { name: 'Mentions and keywords' }) as HTMLInputElement).checked).toBe(true)
    expect(notify.textContent).toContain('Channels follow this until you pick a level in one.')
    await act(async () => fireEvent.click(within(notify).getByRole('radio', { name: 'All new messages' })))
    expect(update).toHaveBeenCalledWith({ defaultLevel: 'all' })
  })
})

describe('Preferences: Keywords', () => {
  it('adds a word with Enter and removes one with its ×', async () => {
    await mount()
    const box = within(section('Keywords')).getByRole('textbox', { name: 'Keywords' })
    fireEvent.change(box, { target: { value: 'page size' } })
    await act(async () => fireEvent.keyDown(box, { key: 'Enter' }))
    expect(update).toHaveBeenLastCalledWith({ keywords: ['deploy', 'page size'] })
    await act(async () => fireEvent.click(within(section('Keywords')).getByRole('button', { name: 'Remove deploy' })))
    expect(update).toHaveBeenLastCalledWith({ keywords: ['page size'] })
  })
  it('a keyword that’s too long says so and keeps what I typed', async () => {
    await mount()
    const box = within(section('Keywords')).getByRole('textbox', { name: 'Keywords' }) as HTMLInputElement
    fireEvent.change(box, { target: { value: 'x'.repeat(41) } })
    await act(async () => fireEvent.keyDown(box, { key: 'Enter' }))
    expect(update).not.toHaveBeenCalled()
    expect(box.value).toBe('x'.repeat(41))
    expect(within(section('Keywords')).getByRole('alert').textContent).toBe('A keyword has at most 40 characters.')
  })
  it('a refused save says why, in that section', async () => {
    update.mockRejectedValueOnce(new ApiError({ status: 400, title: 'Bad request', detail: 'You can have up to 20 keywords.' }))
    await mount()
    const box = within(section('Keywords')).getByRole('textbox', { name: 'Keywords' })
    fireEvent.change(box, { target: { value: 'one more' } })
    await act(async () => fireEvent.keyDown(box, { key: 'Enter' }))
    expect(within(section('Keywords')).getByRole('alert').textContent).toBe('You can have up to 20 keywords.')
  })
})

describe('Preferences: Delivery', () => {
  const stubNotification = (permission: NotificationPermission, answer: NotificationPermission = permission) => {
    const N = Object.assign(vi.fn(), { permission, requestPermission: vi.fn(async () => answer) })
    vi.stubGlobal('Notification', N)
    return N
  }
  it('desktop notifications ask the browser first, and save once it allows them', async () => {
    const N = stubNotification('default', 'granted')
    await mount()
    await act(async () => fireEvent.click(screen.getByRole('switch', { name: 'Desktop notifications' })))
    expect(N.requestPermission).toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({ desktop: true })
  })
  it('says so when the browser blocks them, and saves nothing', async () => {
    stubNotification('denied')
    await mount()
    await act(async () => fireEvent.click(screen.getByRole('switch', { name: 'Desktop notifications' })))
    expect(update).not.toHaveBeenCalled()
    expect(within(section('Delivery')).getByRole('alert').textContent).toMatch(/blocks notifications from Flow/)
  })
  it('a prompt I closed without answering isn’t called a block', async () => {
    stubNotification('default', 'default')
    await mount()
    await act(async () => fireEvent.click(screen.getByRole('switch', { name: 'Desktop notifications' })))
    expect(update).not.toHaveBeenCalled()
    expect(within(section('Delivery')).getByRole('alert').textContent).toBe('Allow notifications when your browser asks, to turn this on.')
  })
  it('push and the email digest are kept, and say the preview doesn’t send them', async () => {
    stubNotification('default')
    await mount()
    const delivery = section('Delivery')
    await act(async () => fireEvent.click(within(delivery).getByRole('switch', { name: 'Mobile push' })))
    expect(update).toHaveBeenCalledWith({ push: false })
    await act(async () => fireEvent.click(within(delivery).getByRole('radio', { name: 'Hourly' })))
    expect(update).toHaveBeenCalledWith({ emailDigest: 'hourly' })
    expect(delivery.textContent).toContain('Not sent in this preview.')
  })
})

describe('Preferences: Do Not Disturb (spec 6.11)', () => {
  it('Pause notifications for an hour, then Resume', async () => {
    await mount()
    const dnd = section('Do Not Disturb')
    fireEvent.click(within(dnd).getByRole('button', { name: 'Pause notifications' }))
    const before = Date.now()
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: '1 hour' })))
    const until = Date.parse((update.mock.calls.at(-1)![0] as { dndUntil: string }).dndUntil)
    expect(until - before).toBeGreaterThanOrEqual(3_599_000)
    expect(until - before).toBeLessThan(3_700_000)
    expect(await within(section('Do Not Disturb')).findByText(/Notifications are paused until/)).toBeTruthy()
    await act(async () => fireEvent.click(within(section('Do Not Disturb')).getByRole('button', { name: 'Resume' })))
    expect(update).toHaveBeenLastCalledWith({ dndUntil: null })
  })
  it('a schedule: on, its days, its times; in its own zone', async () => {
    await mount()
    const dnd = section('Do Not Disturb')
    await act(async () => fireEvent.click(within(dnd).getByRole('switch', { name: 'Turn on a schedule' })))
    expect(update).toHaveBeenLastCalledWith({ dndSchedule: { on: true, from: '18:00', to: '09:00', days: [0, 1, 2, 3, 4], tz: 'Africa/Cairo' } })
    await act(async () => fireEvent.click(within(section('Do Not Disturb')).getByRole('checkbox', { name: 'Thursday' })))
    expect(update).toHaveBeenLastCalledWith({ dndSchedule: expect.objectContaining({ days: [0, 1, 2, 3] }) })
    // A time saves once I leave the field, not at each keystroke (typing "20" would save 02:00 first).
    const from = within(section('Do Not Disturb')).getByLabelText('From') as HTMLInputElement
    const calls = update.mock.calls.length
    await act(async () => fireEvent.change(from, { target: { value: '19:30' } }))
    expect(from.value).toBe('19:30')
    expect(update.mock.calls.length).toBe(calls)
    await act(async () => fireEvent.blur(from))
    expect(update).toHaveBeenLastCalledWith({ dndSchedule: expect.objectContaining({ from: '19:30' }) })
    expect(section('Do Not Disturb').textContent).toContain('Times are in Africa/Cairo.')
  })

  it('quick changes build on each other while the first is still saving', async () => {
    const pending: (() => void)[] = []
    update.mockImplementation((patch: Partial<Preferences>) => new Promise((resolve) => pending.push(() => resolve((stored = { ...stored, ...patch })))))
    await mount()
    await act(async () => fireEvent.click(within(section('Do Not Disturb')).getByRole('checkbox', { name: 'Friday' })))
    // Shown checked at once, before the save answers.
    await vi.waitFor(() => expect((within(section('Do Not Disturb')).getByRole('checkbox', { name: 'Friday' }) as HTMLInputElement).checked).toBe(true))
    await act(async () => fireEvent.click(within(section('Do Not Disturb')).getByRole('checkbox', { name: 'Saturday' })))
    expect(update).toHaveBeenLastCalledWith({ dndSchedule: expect.objectContaining({ days: [0, 1, 2, 3, 4, 5, 6] }) })
    await act(async () => pending.forEach((done) => done()))
    expect(stored.dndSchedule.days).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('a custom time that has passed says so instead of doing nothing', async () => {
    await mount()
    fireEvent.click(within(section('Do Not Disturb')).getByRole('button', { name: 'Pause notifications' }))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Custom time…' })))
    fireEvent.change(screen.getByLabelText('Pause until'), { target: { value: '2020-01-01T09:00' } })
    await act(async () => fireEvent.click(within(section('Do Not Disturb')).getByRole('button', { name: 'Pause' })))
    expect(update).not.toHaveBeenCalled()
    expect(within(section('Do Not Disturb')).getByRole('alert').textContent).toBe('Pick a time after now.')
  })
})
