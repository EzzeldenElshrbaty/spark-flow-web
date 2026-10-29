// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseBody } from '@/lib/messageBody'
import { useGroupConfirm } from '@/pages/chat/composer/useGroupConfirm'

afterEach(cleanup)

function Harness({ members, text, onDone }: { members: number; text: string; onDone: (outcome: string) => void }) {
  const loud = useGroupConfirm('#general', members)
  return (
    <>
      <button type="button" onClick={() => loud.confirm(parseBody(text)).then(() => onDone('sent'), () => onDone('kept'))}>
        Send
      </button>
      {loud.dialog}
    </>
  )
}

const press = (name: string) => act(async () => fireEvent.click(screen.getByRole('button', { name })))

describe('useGroupConfirm (spec 6.8: confirm before @here or @channel to more than 25 members)', () => {
  it('sends at once without a group mention, or to 25 members or fewer', async () => {
    const onDone = vi.fn()
    render(<Harness members={40} text="hello" onDone={onDone} />)
    await press('Send')
    expect(onDone).toHaveBeenCalledWith('sent')
    cleanup()
    render(<Harness members={25} text="@channel hello" onDone={onDone} />)
    await press('Send')
    expect(onDone).toHaveBeenLastCalledWith('sent')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('above 25 asks first, naming how many it notifies; Send and notify sends', async () => {
    const onDone = vi.fn()
    render(<Harness members={26} text="@channel release is out" onDone={onDone} />)
    await press('Send')
    const dialog = screen.getByRole('dialog', { name: 'Notify everyone in #general?' })
    expect(dialog.textContent).toContain('@channel notifies all 26 people in this channel.')
    expect(onDone).not.toHaveBeenCalled()
    await press('Send and notify')
    expect(onDone).toHaveBeenCalledWith('sent')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('@here says it reaches whoever is active; Cancel keeps the message unsent', async () => {
    const onDone = vi.fn()
    render(<Harness members={30} text="standup @here" onDone={onDone} />)
    await press('Send')
    expect(screen.getByRole('dialog').textContent).toContain('@here notifies whoever is active of the 30 people in this channel.')
    await press('Cancel')
    expect(onDone).toHaveBeenCalledWith('kept')
  })
})
