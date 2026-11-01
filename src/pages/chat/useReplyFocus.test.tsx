// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { MemoryRouter, useNavigate } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { replyState, useReplyFocus } from '@/pages/chat/useReplyFocus'

afterEach(cleanup)

function Thread() {
  const box = useReplyFocus()
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => navigate({ search: '?thread=m1' }, { state: replyState })}>
        Reply in thread
      </button>
      <div ref={box}>
        <textarea aria-label="Reply in the thread" />
      </div>
    </>
  )
}
const reply = () => screen.getByRole('textbox', { name: 'Reply in the thread' })

describe('useReplyFocus (Reply in thread, T: spec 6.4 and 10)', () => {
  it('a thread opened to reply puts the caret in its reply box', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/c', search: '?thread=m1', state: replyState }]}>
        <Thread />
      </MemoryRouter>,
    )
    expect(document.activeElement).toBe(reply())
  })

  it('a thread opened any other way (its summary, a link) leaves focus alone', () => {
    render(
      <MemoryRouter initialEntries={['/c?thread=m1']}>
        <Thread />
      </MemoryRouter>,
    )
    expect(document.activeElement).not.toBe(reply())
  })

  it('asking again while it is open puts the caret back', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/c', search: '?thread=m1', state: replyState }]}>
        <Thread />
      </MemoryRouter>,
    )
    const again = screen.getByRole('button', { name: 'Reply in thread' })
    again.focus()
    fireEvent.click(again)
    expect(document.activeElement).toBe(reply())
  })

  it('a reply box that comes after the thread has loaded (who may post is known later) still gets the caret', async () => {
    function Loading() {
      const box = useReplyFocus()
      const [ready, setReady] = useState(false)
      useEffect(() => {
        const timer = setTimeout(() => setReady(true), 10)
        return () => clearTimeout(timer)
      }, [])
      return <div ref={box}>{ready && <textarea aria-label="Reply in the thread" />}</div>
    }
    render(
      <MemoryRouter initialEntries={[{ pathname: '/c', search: '?thread=m1', state: replyState }]}>
        <Loading />
      </MemoryRouter>,
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(reply()))
  })
})

describe('useReplyFocus with a saved draft (spec 6.8)', () => {
  it('the caret goes after the draft, to carry on typing', () => {
    function Drafted() {
      const box = useReplyFocus()
      return (
        <div ref={box}>
          <div contentEditable suppressContentEditableWarning aria-label="Reply in the thread" role="textbox">
            half a thought
          </div>
        </div>
      )
    }
    render(
      <MemoryRouter initialEntries={[{ pathname: '/c', search: '?thread=m1', state: replyState }]}>
        <Drafted />
      </MemoryRouter>,
    )
    const selection = window.getSelection()!
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Reply in the thread' }))
    expect(selection.isCollapsed).toBe(true)
    expect(selection.focusOffset).toBe('half a thought'.length)
  })
})
