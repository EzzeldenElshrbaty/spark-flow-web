// @vitest-environment jsdom
import { IconDotsVertical, IconListCheck } from '@tabler/icons-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IconButton } from '@/components/sf/Button'
import { MenuItem } from '@/components/sf/Menu'
import { ToastProvider, ToastRegion } from '@/components/sf/Toast'
import { MessageMenu } from '@/pages/chat/MessageActions'

const removed = vi.fn(async () => {})
const restored = vi.fn()
vi.mock('@/api/chat', async (original) => ({
  ...(await original<typeof import('@/api/chat')>()),
  useDeleteMessage: () => ({ mutateAsync: removed, isPending: false, error: null }),
  useRestoreMessage: () => ({ mutateAsync: restored }),
}))

afterEach(cleanup)
beforeEach(() => {
  removed.mockClear()
  restored.mockClear()
})
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

type Props = Partial<ComponentProps<typeof MessageMenu>>
const trigger: ComponentProps<typeof MessageMenu>['trigger'] = (props) => <IconButton label="More actions" icon={IconDotsVertical} data-row-focus="" {...props} />

function show(props: Props = {}) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MessageMenu target={{ kind: 'message', id: 'm1' }} can={{ edit: true, remove: true }} onEdit={vi.fn()} trigger={trigger} {...props} />
        <ToastRegion />
      </ToastProvider>
    </QueryClientProvider>,
  )
}
const more = () => screen.getByRole('button', { name: 'More actions' })
/** The open menu, top to bottom: item names, and — for each separator. */
const rows = () =>
  [...screen.getByRole('menu', { name: 'Message actions' }).querySelectorAll('[role="menuitem"], [role="separator"]')].map((el) =>
    el.getAttribute('role') === 'separator' ? '—' : el.querySelector('span')?.textContent,
  )
const deleteFromMenu = async () => {
  fireEvent.click(more())
  await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Delete message' })))
}

describe('the ⋯ menu (spec 6.5)', () => {
  it('is in the spec’s order, with its separators and keys', () => {
    show({
      onMarkUnread: vi.fn(),
      onCopyLink: vi.fn(),
      onCopyText: vi.fn(),
      extra: (
        <MenuItem icon={IconListCheck} onSelect={vi.fn()}>
          Create task
        </MenuItem>
      ),
    })
    fireEvent.click(more())
    expect(rows()).toEqual(['Mark unread', '—', 'Create task', 'Copy link', 'Copy text', '—', 'Edit message', 'Delete message'])
    const key = (name: string) => screen.getByRole('menuitem', { name }).getAttribute('aria-keyshortcuts')
    expect([key('Mark unread'), key('Copy link'), key('Edit message')]).toEqual(['U', 'L', 'E'])
  })

  it('Get notified about replies comes first, with Mark unread; while following it turns it off (spec 6.5, 6.7)', () => {
    const onToggle = vi.fn()
    show({ follow: { following: false, onToggle }, onMarkUnread: vi.fn(), onCopyLink: vi.fn() })
    fireEvent.click(more())
    expect(rows()).toEqual(['Get notified about replies', 'Mark unread', '—', 'Copy link', '—', 'Edit message', 'Delete message'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Get notified about replies' }))
    expect(onToggle).toHaveBeenCalledOnce()
    cleanup()
    show({ follow: { following: true, onToggle } })
    fireEvent.click(more())
    expect(screen.getByRole('menuitem', { name: 'Turn off notifications for replies' })).toBeTruthy()
  })

  it('separates only groups that have items, and has no row of emoji (the toolbar carries them)', () => {
    show({ can: { edit: false, remove: false }, onCopyLink: vi.fn(), onCopyText: vi.fn() })
    fireEvent.click(more())
    expect(rows()).toEqual(['Copy link', 'Copy text'])
    expect(screen.queryByRole('group', { name: 'Add reaction' })).toBeNull()
  })

  it('each item runs once and closes the menu', () => {
    const onCopyText = vi.fn()
    show({ onCopyText })
    fireEvent.click(more())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }))
    expect(onCopyText).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(more())
  })

  it('in the menu, U picks Mark unread (its key), as it does on the message', () => {
    const onMarkUnread = vi.fn()
    show({ onMarkUnread })
    fireEvent.click(more())
    fireEvent.keyDown(document.activeElement!, { key: 'u' })
    expect(onMarkUnread).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Mark unread is offered even where I can do nothing else to the message (a read-only or archived channel)', () => {
    const onMarkUnread = vi.fn()
    show({ can: { edit: false, remove: false }, onMarkUnread })
    fireEvent.click(more())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark unread' }))
    expect(onMarkUnread).toHaveBeenCalledOnce()
  })

  it('with nothing to offer there is no ⋯ at all', () => {
    show({ can: { edit: false, remove: false } })
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })

  it('on a phone, what the toolbar carries comes first in the sheet', () => {
    show({ lead: <MenuItem onSelect={vi.fn()}>Reply in thread</MenuItem>, onCopyLink: vi.fn() })
    fireEvent.click(more())
    expect(rows()).toEqual(['Reply in thread', '—', 'Copy link', '—', 'Edit message', 'Delete message'])
  })
})

describe('delete (spec 6.3)', () => {
  it('a plain message goes at once, with "Message deleted · Undo" that restores it', async () => {
    show()
    await deleteFromMenu()
    expect(removed).toHaveBeenCalledWith({ kind: 'message', id: 'm1' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Message deleted')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(restored).toHaveBeenCalledWith({ kind: 'message', id: 'm1' })
  })

  it('one with replies or files asks first; Cancel keeps it', async () => {
    show({ confirmDelete: true })
    await deleteFromMenu()
    expect(removed).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Delete message?' })).toBeTruthy()
    // Since files can be shared in several places (slice 6), deleting a message takes them off it, not out of everywhere.
    expect(screen.getByRole('dialog', { description: "Replies in its thread stay. Its files go from this message but stay wherever else they’re shared." })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(removed).not.toHaveBeenCalled()
  })

  it('confirming deletes it, still with Undo', async () => {
    show({ confirmDelete: true })
    await deleteFromMenu()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete message' })))
    expect(removed).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toContain('Message deleted')
  })
})

describe('focus after a delete (spec 10: the deleted row takes its toolbar with it)', () => {
  /** A list of rows, each with its ⋯ as the row's focus stop; `ids` names them. */
  function list(ids: string[], confirmDelete = false) {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <div role="log" tabIndex={0} aria-label="Messages">
            <ol>
              {ids.map((id) => (
                <li key={id}>
                  <article aria-label={id}>
                    <MessageMenu target={{ kind: 'message', id }} can={{ edit: true, remove: true }} confirmDelete={confirmDelete} onEdit={vi.fn()} trigger={trigger} />
                  </article>
                </li>
              ))}
              <li>New messages</li>
            </ol>
          </div>
          <ToastRegion />
        </ToastProvider>
      </QueryClientProvider>,
    )
  }
  const actionsOf = (id: string) => screen.getByRole('article', { name: id }).querySelector('button')!
  const deleteRow = async (id: string, confirm = false) => {
    fireEvent.click(actionsOf(id))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Delete message' })))
    if (confirm) await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete message' })))
  }

  it("goes to the next message's toolbar", async () => {
    list(['m1', 'm2', 'm3'])
    await deleteRow('m1')
    expect(document.activeElement).toBe(actionsOf('m2'))
  })

  it('goes to the one before when it was the last, also after confirming', async () => {
    list(['m1', 'm2'], true)
    await deleteRow('m2', true)
    expect(document.activeElement).toBe(actionsOf('m1'))
  })

  it('still lands on the next message when the deleted row leaves the list at once, toolbar and all (as in the channel)', async () => {
    let drop: (id: string) => void = () => {}
    function Live() {
      const [ids, setIds] = useState(['m1', 'm2', 'm3'])
      drop = (id) => setIds((all) => all.filter((x) => x !== id))
      return (
        <div role="log" tabIndex={0} aria-label="Messages">
          <ol>
            {ids.map((id) => (
              <li key={id}>
                <article aria-label={id}>
                  <MessageMenu target={{ kind: 'message', id }} can={{ edit: true, remove: true }} confirmDelete onEdit={vi.fn()} trigger={trigger} />
                </article>
              </li>
            ))}
          </ol>
        </div>
      )
    }
    removed.mockImplementationOnce(async () => {
      await Promise.resolve()
      act(() => drop('m2'))
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <Live />
          <ToastRegion />
        </ToastProvider>
      </QueryClientProvider>,
    )
    await deleteRow('m2', true)
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(screen.queryByRole('article', { name: 'm2' })).toBeNull()
    expect(document.activeElement).toBe(actionsOf('m3'))
  })

  it('goes to the list when it was the only one', async () => {
    list(['m1'])
    await deleteRow('m1')
    expect(document.activeElement).toBe(screen.getByRole('log'))
  })
})
