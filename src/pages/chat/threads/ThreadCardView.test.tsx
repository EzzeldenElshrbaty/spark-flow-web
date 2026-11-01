// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThreadCardView } from './ThreadCardView'

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const people = [
  { id: 'u-2', name: 'Nour El-Sayed' },
  { id: 'u-1', name: 'Youssef Abdelrahman' },
]
function show(over: Partial<ComponentProps<typeof ThreadCardView>> = {}) {
  const props: ComponentProps<typeof ThreadCardView> = {
    place: '#backend',
    participants: people,
    newCount: 2,
    hiddenCount: 5,
    loadingMore: false,
    onShowMore: vi.fn(),
    unfollowed: false,
    muted: false,
    onToggleMute: vi.fn(),
    onUnfollow: vi.fn(),
    onFollow: vi.fn(),
    followError: null,
    channelHref: '/w/engineering/c/c-backend?message=m1',
    link: 'http://localhost/w/engineering/c/c-backend?thread=m1',
    parent: <p>The parent</p>,
    replies: <p>The replies</p>,
    replyBox: <p>The box</p>,
    ...over,
  }
  const view = render(
    <MemoryRouter>
      <ThreadCardView {...props} />
    </MemoryRouter>,
  )
  const rerender = (next: Partial<ComponentProps<typeof ThreadCardView>>) =>
    view.rerender(
      <MemoryRouter>
        <ThreadCardView {...props} {...next} />
      </MemoryRouter>,
    )
  return { props, rerender, card: screen.getByRole('article', { name: /#backend/ }) }
}

describe('ThreadCardView (spec 6.12 Threads)', () => {
  it('has the place, the people, how many are new, the parent, more replies, the replies and the box', () => {
    const { card } = show()
    expect(within(card).getByRole('heading', { name: /#backend/ })).toBeTruthy()
    expect(card.textContent).toContain('2 new')
    expect(within(card).getByRole('img', { name: 'Nour El-Sayed and Youssef Abdelrahman' })).toBeTruthy()
    const text = card.textContent!
    expect(text.indexOf('The parent')).toBeLessThan(text.indexOf('Show 5 more replies'))
    expect(text.indexOf('Show 5 more replies')).toBeLessThan(text.indexOf('The replies'))
    expect(text.indexOf('The replies')).toBeLessThan(text.indexOf('The box'))
  })

  it('Show N more replies asks for the rest, says when it loads, and goes once none are hidden', () => {
    const { props } = show()
    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more replies' }))
    expect(props.onShowMore).toHaveBeenCalledOnce()
    cleanup()
    show({ loadingMore: true })
    expect((screen.getByRole('button', { name: 'Loading replies…' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    show({ hiddenCount: 0, newCount: 0 })
    expect(screen.queryByRole('button', { name: /more repl/ })).toBeNull()
    expect(screen.getByRole('article').textContent).not.toContain('new')
    cleanup()
    show({ hiddenCount: 1 })
    expect(screen.getByRole('button', { name: 'Show 1 more reply' })).toBeTruthy()
  })

  it('Unfollow folds the card where it is, with Follow again', () => {
    const { props } = show()
    fireEvent.click(screen.getByRole('button', { name: 'Unfollow' }))
    expect(props.onUnfollow).toHaveBeenCalledOnce()
    cleanup()
    const folded = show({ unfollowed: true })
    expect(folded.card.textContent).toContain('You won’t be told about new replies.')
    expect(folded.card.textContent).not.toContain('The parent')
    fireEvent.click(screen.getByRole('button', { name: 'Follow again' }))
    expect(folded.props.onFollow).toHaveBeenCalledOnce()
  })

  it('keeps the keyboard on the card: Unfollow hands focus to Follow again, and back', () => {
    const { rerender } = show()
    screen.getByRole('button', { name: 'Unfollow' }).focus()
    rerender({ unfollowed: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Follow again' }))
    rerender({ unfollowed: false })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Unfollow' }))
  })

  it('does not take focus when it first shows', () => {
    show({ unfollowed: true })
    expect(document.activeElement).toBe(document.body)
  })

  it('says why following didn’t change, near the button', () => {
    show({ followError: 'Couldn’t change that. Try again.' })
    expect(screen.getByRole('alert').textContent).toBe('Couldn’t change that. Try again.')
  })

  it('⋯ offers View in channel and Copy link', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Thread actions' }))
    expect(screen.getByRole('menuitem', { name: 'View in channel' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeTruthy()
  })

  it('a muted thread says so, and ⋯ offers Unmute thread (slice AA)', async () => {
    const onToggleMute = vi.fn()
    show({ muted: true, onToggleMute })
    expect(screen.getByText('Muted')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Thread actions' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unmute thread' }))
    expect(onToggleMute).toHaveBeenCalled()
  })
})
