// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/sf/Toast'
import { api } from '@/lib/api'
import { emojiInfo } from '@/lib/emoji'
import { MessageToolbar } from '@/pages/chat/MessageToolbar'

const desktop = ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
const phone = ((media: string) => ({ matches: media.includes('767px') || media.includes('639px'), media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
window.matchMedia = desktop

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.matchMedia = desktop
})

type Props = Partial<ComponentProps<typeof MessageToolbar>>
function show(props: Props = {}) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <ToastProvider>
        <article className="group">
          <MessageToolbar
            target={{ kind: 'message', id: 'm1' }}
            reactions={[]}
            meId="u-1"
            can={{ react: true, edit: false, remove: false }}
            onEdit={vi.fn()}
            onReply={vi.fn()}
            onCopyLink={vi.fn()}
            onCopyText={vi.fn()}
            {...props}
          />
        </article>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
const toolbar = () => screen.getByRole('toolbar', { name: 'Message actions' })
const buttons = () => within(toolbar()).getAllByRole('button')
const named = (name: string) => within(toolbar()).getByRole('button', { name })
const stop = () => buttons().filter((b) => b.tabIndex === 0)

describe('the message toolbar (spec 6.4)', () => {
  it('carries the quick reactions, Add reaction, Reply in thread and More, as one Tab stop (More)', () => {
    show()
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual(['React with ✅', 'React with 👀', 'React with 🙌', 'Add reaction', 'Reply in thread', 'More actions'])
    expect(stop()).toEqual([named('More actions')])
  })

  it('arrow keys, Home and End move along it, and the Tab stop follows', () => {
    show()
    named('More actions').focus()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(named('Reply in thread'))
    expect(stop()).toEqual([named('Reply in thread')])
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(document.activeElement).toBe(named('React with ✅'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(named('More actions'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(named('React with ✅'))
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(document.activeElement).toBe(named('More actions'))
  })

  it('a quick reaction shows mine pressed and toggles', async () => {
    const react = vi.spyOn(api.chat, 'react').mockResolvedValue()
    show({ reactions: [{ emoji: '✅', userIds: ['u-1'] }] })
    expect(named('React with ✅').getAttribute('aria-pressed')).toBe('true')
    expect(named('React with 👀').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(named('React with 👀'))
    await vi.waitFor(() => expect(react).toHaveBeenCalledWith({ kind: 'message', id: 'm1' }, '👀'))
  })

  it('Reply in thread says its key (T) and opens the thread', () => {
    const onReply = vi.fn()
    show({ onReply })
    expect(named('Reply in thread').getAttribute('aria-keyshortcuts')).toBe('T')
    fireEvent.click(named('Reply in thread'))
    expect(onReply).toHaveBeenCalledOnce()
  })

  it('no Reply in thread on a reply or in its own thread, and no reactions where I may not react', () => {
    show({ onReply: undefined, can: { react: false, edit: false, remove: false } })
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual(['More actions'])
  })

  it('Add reaction opens the picker, which only adds: picking one I gave already leaves it', async () => {
    const react = vi.spyOn(api.chat, 'react').mockResolvedValue()
    show({ reactions: [{ emoji: '✅', userIds: ['u-1'] }] })
    const pick = (emoji: string) => {
      fireEvent.click(named('Add reaction'))
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Add reaction' })).getAllByRole('button', { name: emojiInfo(emoji)!.name })[0])
    }
    pick('✅')
    expect(screen.queryByRole('dialog', { name: 'Add reaction' })).toBeNull()
    pick('👀')
    await vi.waitFor(() => expect(react).toHaveBeenCalledWith({ kind: 'message', id: 'm1' }, '👀'))
    expect(react).toHaveBeenCalledOnce()
  })
})

describe('a delete the server refuses (spec 6.3)', () => {
  it('says why under the toolbar, outside it, so it stays when the toolbar hides', async () => {
    vi.spyOn(api.chat, 'remove').mockRejectedValue(new Error("You can't delete this message."))
    show({ can: { react: true, edit: false, remove: true } })
    fireEvent.click(named('More actions'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete message' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe("You can't delete this message.")
    expect(toolbar().contains(alert)).toBe(false)
  })
})

describe('on a touch screen with no hover (a tablet, 768px and up)', () => {
  it('the ⋯ stands in for the toolbar: it shows, and its menu starts with what the toolbar carries', () => {
    window.matchMedia = ((media: string) => ({ matches: media.includes('hover: none'), media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    show()
    expect(screen.queryByRole('toolbar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const menu = screen.getByRole('menu', { name: 'Message actions' })
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'React with ✅' })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: 'Reply in thread' })).toBeTruthy()
  })
})

describe('on a phone (no hover: the ⋯ and its sheet)', () => {
  it('there is no toolbar; the sheet starts with the quick reactions, Add reaction and Reply in thread', async () => {
    window.matchMedia = phone
    const react = vi.spyOn(api.chat, 'react').mockResolvedValue()
    const onReply = vi.fn()
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    show({ onReply })
    expect(screen.queryByRole('toolbar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    // Without a warning: each row of the sheet has its key.
    expect(warn).not.toHaveBeenCalled()
    const menu = screen.getByRole('menu', { name: 'Message actions' })
    const items = [...menu.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')].map((el) => el.getAttribute('aria-label') ?? el.textContent)
    expect(items.slice(0, 5)).toEqual(['React with ✅', 'React with 👀', 'React with 🙌', 'Add reaction', 'Reply in thread'])
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'React with 🙌' }))
    await vi.waitFor(() => expect(react).toHaveBeenCalledWith({ kind: 'message', id: 'm1' }, '🙌'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Add reaction in the sheet opens the picker; closing it puts focus back on the ⋯', () => {
    window.matchMedia = phone
    show()
    // The picker's own trigger is out of sight and out of the screen reader's way: the sheet's item is the way in.
    expect(screen.queryAllByRole('button', { name: 'Add reaction' })).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add reaction' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Add reaction' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Add reaction' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions' }))
  })
})
