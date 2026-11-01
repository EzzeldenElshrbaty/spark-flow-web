// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/api/types'
import { parseBody } from '@/lib/messageBody'
import { useInviteOnSend } from '@/pages/chat/composer/useInviteOnSend'

afterEach(cleanup)

const people = [
  { id: 'u-1', name: 'Youssef Abdelrahman' },
  { id: 'u-2', name: 'Nour El-Sayed' },
  { id: 'u-3', name: 'Mariam Fathy' },
] as User[]

function Harness({ text, mayAdd, add, onDone }: { text: string; mayAdd: boolean; add: (ids: string[]) => Promise<unknown>; onDone: (o: string) => void }) {
  const invite = useInviteOnSend({ where: '#backend', memberIds: ['u-1'], people, mayAdd, add })
  return (
    <>
      <button type="button" onClick={() => invite.confirm(parseBody(text)).then(() => onDone('sent'), () => onDone('kept'))}>
        Send
      </button>
      {invite.dialog}
    </>
  )
}
const press = (name: string) => act(async () => fireEvent.click(screen.getByRole('button', { name })))

describe('useInviteOnSend (spec 6.8: "Not in this channel" asks to invite on send)', () => {
  it('sends at once when everyone mentioned is in the channel', async () => {
    const onDone = vi.fn()
    render(<Harness text="hi @[Youssef Abdelrahman](u-1)" mayAdd add={vi.fn()} onDone={onDone} />)
    await press('Send')
    expect(onDone).toHaveBeenCalledWith('sent')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks to add whoever isn’t in it; Add and send adds them, then sends', async () => {
    const add = vi.fn(async () => {})
    const onDone = vi.fn()
    render(<Harness text="@[Nour El-Sayed](u-2) and @[Mariam Fathy](u-3) look" mayAdd add={add} onDone={onDone} />)
    await press('Send')
    const dialog = screen.getByRole('dialog', { name: 'Add 2 people to #backend?' })
    expect(dialog.textContent).toContain('Nour El-Sayed and Mariam Fathy aren’t in this channel, so they won’t see this message.')
    await press('Add and send')
    expect(add).toHaveBeenCalledWith(['u-2', 'u-3'])
    expect(onDone).toHaveBeenCalledWith('sent')
  })

  it('Leave them out sends without adding; a failed add says why and sends nothing', async () => {
    const add = vi.fn(async () => {
      throw new Error('Only its members can change this channel.')
    })
    const onDone = vi.fn()
    render(<Harness text="ping @[Nour El-Sayed](u-2)" mayAdd add={add} onDone={onDone} />)
    await press('Send')
    expect(screen.getByRole('dialog', { name: 'Add Nour El-Sayed to #backend?' })).toBeTruthy()
    await press('Add and send')
    expect(screen.getByRole('alert').textContent).toBe('Only its members can change this channel.')
    expect(onDone).not.toHaveBeenCalled()
    await press('Leave them out')
    expect(onDone).toHaveBeenCalledWith('sent')
  })

  it('without the right to add people it says so; Send anyway sends, Cancel keeps the text', async () => {
    const onDone = vi.fn()
    render(<Harness text="ping @[Nour El-Sayed](u-2)" mayAdd={false} add={vi.fn()} onDone={onDone} />)
    await press('Send')
    expect(screen.getByRole('dialog').textContent).toContain('Only its members can add people.')
    expect(screen.queryByRole('button', { name: 'Add and send' })).toBeNull()
    await press('Cancel')
    expect(onDone).toHaveBeenCalledWith('kept')
    await press('Send')
    await press('Send anyway')
    expect(onDone).toHaveBeenLastCalledWith('sent')
  })
})
