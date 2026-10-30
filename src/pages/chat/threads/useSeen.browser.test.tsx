import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSeen } from './useSeen'

afterEach(cleanup)

function Card({ active, onSeen, ms = 300 }: { active: boolean; onSeen: () => void; ms?: number }) {
  const ref = useSeen<HTMLDivElement>(active, onSeen, ms)
  return <div ref={ref} data-testid="card" style={{ height: 300 }} />
}
function mount(active: boolean, onSeen: () => void) {
  const view = render(
    <div data-testid="scroller" style={{ height: 400, overflowY: 'auto' }}>
      <div style={{ height: 1200 }} />
      <Card active={active} onSeen={onSeen} />
      <div style={{ height: 1200 }} />
    </div>,
  )
  return { ...view, scroller: view.getByTestId('scroller'), card: view.getByTestId('card') }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('useSeen (spec 6.12: a card is read once it has been on screen a moment)', () => {
  it('fires once the card has stayed on screen for the delay, not while it is off screen', async () => {
    const onSeen = vi.fn()
    const { scroller, card } = mount(true, onSeen)
    await wait(500)
    expect(onSeen).not.toHaveBeenCalled()
    card.scrollIntoView()
    await wait(100)
    expect(onSeen).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(onSeen).toHaveBeenCalledOnce(), { timeout: 2000 })
    void scroller
  })

  it('a card scrolled past quickly is not read', async () => {
    const onSeen = vi.fn()
    const { scroller, card } = mount(true, onSeen)
    card.scrollIntoView()
    await wait(100)
    scroller.scrollTop = 0
    await wait(600)
    expect(onSeen).not.toHaveBeenCalled()
  })

  it('does nothing while inactive (nothing unread), and fires when it turns active on screen', async () => {
    const onSeen = vi.fn()
    const { card, rerender } = mount(false, onSeen)
    card.scrollIntoView()
    await wait(600)
    expect(onSeen).not.toHaveBeenCalled()
    rerender(
      <div data-testid="scroller" style={{ height: 400, overflowY: 'auto' }}>
        <div style={{ height: 1200 }} />
        <Card active onSeen={onSeen} />
        <div style={{ height: 1200 }} />
      </div>,
    )
    await vi.waitFor(() => expect(onSeen).toHaveBeenCalledOnce(), { timeout: 2000 })
  })
  it('fires once while active, even when the card leaves and comes back before the list says it is read', async () => {
    const onSeen = vi.fn()
    const { scroller, card } = mount(true, onSeen)
    card.scrollIntoView()
    await vi.waitFor(() => expect(onSeen).toHaveBeenCalledOnce(), { timeout: 2000 })
    scroller.scrollTop = 0
    await wait(100)
    card.scrollIntoView()
    await wait(600)
    expect(onSeen).toHaveBeenCalledOnce()
  })
})
