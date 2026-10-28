// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, ToastRegion } from '@/components/sf/Toast'
import { MessageActions } from '@/pages/chat/MessageActions'

const removed = vi.fn(async () => {})
const restored = vi.fn()
vi.mock('@/api/chat', async (original) => ({
  ...(await original<typeof import('@/api/chat')>()),
  useDeleteMessage: () => ({ mutateAsync: removed, isPending: false, error: null }),
  useRestoreMessage: () => ({ mutate: restored }),
}))

afterEach(cleanup)
beforeEach(() => {
  removed.mockClear()
  restored.mockClear()
})
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

function show(confirmDelete: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MessageActions target={{ kind: 'message', id: 'm1' }} can={{ react: false, edit: true, remove: true }} confirmDelete={confirmDelete} onEdit={vi.fn()} />
        <ToastRegion />
      </ToastProvider>
    </QueryClientProvider>,
  )
}
const deleteFromMenu = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Message actions' }))
  await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /Delete message/ })))
}

describe('Mark unread (spec 10)', () => {
  it('is offered even where I can do nothing else to the message (a read-only or archived channel)', () => {
    const onMarkUnread = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <MessageActions target={{ kind: 'message', id: 'm1' }} can={{ react: false, edit: false, remove: false }} onEdit={vi.fn()} onMarkUnread={onMarkUnread} />
        </ToastProvider>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Message actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark unread' }))
    expect(onMarkUnread).toHaveBeenCalledOnce()
  })
})

describe('delete (spec 6.3)', () => {
  it('a plain message goes at once, with "Message deleted · Undo" that restores it', async () => {
    show(false)
    await deleteFromMenu()
    expect(removed).toHaveBeenCalledWith({ kind: 'message', id: 'm1' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Message deleted')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(restored).toHaveBeenCalledWith({ kind: 'message', id: 'm1' }, expect.anything())
  })

  it('one with replies or files asks first; Cancel keeps it', async () => {
    show(true)
    await deleteFromMenu()
    expect(removed).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Delete message?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(removed).not.toHaveBeenCalled()
  })

  it('confirming deletes it, still with Undo', async () => {
    show(true)
    await deleteFromMenu()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete message' })))
    expect(removed).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toContain('Message deleted')
  })
})

describe('focus after a delete (spec 10: the deleted row takes its ⋯ with it)', () => {
  /** A list of rows, each with its ⋯; `ids` names them. */
  function list(ids: string[], confirmDelete = false) {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <div role="log" tabIndex={0} aria-label="Messages">
            <ol>
              {ids.map((id) => (
                <li key={id}>
                  <article aria-label={id}>
                    <MessageActions target={{ kind: 'message', id }} can={{ react: false, edit: true, remove: true }} confirmDelete={confirmDelete} onEdit={vi.fn()} />
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
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /Delete message/ })))
    if (confirm) await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete message' })))
  }

  it("goes to the next message's ⋯", async () => {
    list(['m1', 'm2', 'm3'])
    await deleteRow('m1')
    expect(document.activeElement).toBe(actionsOf('m2'))
  })

  it("goes to the one before when it was the last, also after confirming", async () => {
    list(['m1', 'm2'], true)
    await deleteRow('m2', true)
    expect(document.activeElement).toBe(actionsOf('m1'))
  })

  it('goes to the list when it was the only one', async () => {
    list(['m1'])
    await deleteRow('m1')
    expect(document.activeElement).toBe(screen.getByRole('log'))
  })
})
