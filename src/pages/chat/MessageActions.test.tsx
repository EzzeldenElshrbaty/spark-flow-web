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
