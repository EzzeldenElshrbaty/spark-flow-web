// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Announcer } from '@/components/sf/Announcer'
import { api } from '@/lib/api'
import { ThreadMenu } from '@/pages/chat/ThreadMenu'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const link = 'https://flow.example/w/engineering/c/c1?thread=m1'
function show(following = false) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <ThreadMenu messageId="m1" following={following} link={link} />
      <Announcer />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Thread actions' }))
  return screen.getByRole('menu', { name: 'Thread actions' })
}

describe('the thread panel’s ⋮ (spec 6.7)', () => {
  it('offers Copy link, following, and Open in a new window', () => {
    const menu = show()
    expect(within(menu).getAllByRole('menuitem').map((el) => el.querySelector('span')?.textContent)).toEqual(['Copy link', 'Get notified about replies', 'Mute thread', 'Open in a new window'])
  })

  it('following there is the same as in the message’s menu, both ways', async () => {
    const setFollowing = vi.spyOn(api.chat, 'setFollowing').mockResolvedValue()
    fireEvent.click(within(show()).getByRole('menuitem', { name: 'Get notified about replies' }))
    await vi.waitFor(() => expect(setFollowing).toHaveBeenCalledWith('m1', true))
    cleanup()
    fireEvent.click(within(show(true)).getByRole('menuitem', { name: 'Turn off notifications for replies' }))
    await vi.waitFor(() => expect(setFollowing).toHaveBeenCalledWith('m1', false))
  })

  it('Mute thread mutes it and says what that means (slice AA)', async () => {
    const setMuted = vi.spyOn(api.chat, 'setThreadMuted').mockResolvedValue()
    fireEvent.click(within(show()).getByRole('menuitem', { name: 'Mute thread' }))
    await vi.waitFor(() => expect(setMuted).toHaveBeenCalledWith('m1', true))
    expect(await screen.findByText('Thread muted. Only mentions of you will reach you.', { selector: 'p' })).toBeTruthy()
  })

  it('Copy link copies the thread’s link and says so, on screen and read out', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    fireEvent.click(within(show()).getByRole('menuitem', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(link)
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('Link copied'))
    expect(screen.getByText('Link copied', { selector: 'p' })).toBeTruthy()
  })

  it('a copy the browser refuses says so, and the words stay', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) }, configurable: true })
    fireEvent.click(within(show()).getByRole('menuitem', { name: 'Copy link' }))
    expect(await screen.findByText("Couldn't copy the link", { selector: 'p' })).toBeTruthy()
  })

  it('Open in a new window opens the thread’s link there', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    fireEvent.click(within(show()).getByRole('menuitem', { name: 'Open in a new window' }))
    expect(open).toHaveBeenCalledWith(link, '_blank', 'noopener')
  })
})
