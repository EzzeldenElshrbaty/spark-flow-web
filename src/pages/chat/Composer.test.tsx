// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '@/pages/chat/Composer'

vi.mock('@/lib/useMentionDirectory', () => ({ useMentionDirectory: () => ({ users: [], projects: [], tasks: [], ws: 'engineering', known: {} }) }))
afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const box = () => document.querySelector('textarea')!
const type = (text: string) => fireEvent.change(box(), { target: { value: text, selectionStart: text.length } })

describe('the project and task Composer (spec 6.8 groups)', () => {
  it('offers @here only where it reaches someone: not in a task comment', () => {
    render(<Composer placeholder="Comment" submitLabel="Comment" pendingLabel="Posting…" onSubmit={vi.fn()} here={false} />)
    type('@')
    expect(screen.queryByText('@here')).toBeNull()
    expect(screen.getByText('@channel')).toBeTruthy()
    cleanup()
    render(<Composer placeholder="Message" submitLabel="Send" pendingLabel="Sending…" onSubmit={vi.fn()} />)
    type('@')
    expect(screen.getByText('@here')).toBeTruthy()
  })

  it('in a channel of more than 25 members it asks before @channel goes out; Cancel keeps the text', async () => {
    const onSubmit = vi.fn(async () => {})
    render(<Composer placeholder="Message" submitLabel="Send" pendingLabel="Sending…" onSubmit={onSubmit} confirmGroup={{ where: '#p-nexus', members: 30 }} />)
    type('@channel release is out')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Send/ })))
    expect(screen.getByRole('dialog', { name: 'Notify everyone in #p-nexus?' })).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(box().value).toBe('@channel release is out')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Send/ })))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send and notify' })))
    expect(onSubmit).toHaveBeenCalledWith('@channel release is out')
  })
})
