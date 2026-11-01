import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { SortableSideList } from '@/layout/SortableSideList'

afterEach(cleanup)

const items = [
  { id: 'a', label: 'alpha', muted: false },
  { id: 'b', label: 'backend', muted: false },
  { id: 'c', label: 'general', muted: false },
  { id: 'm', label: 'muted-one', muted: true },
]
function mount(onReorder = vi.fn(), onOpen = vi.fn()) {
  render(
    <div className="sf bg-sf-frame" style={{ width: 260 }}>
      <ul>
        <SortableSideList label="Channels" items={items} onReorder={onReorder}>
          {(item, describedBy) => (
            <a href={`#${item.id}`} aria-describedby={describedBy} onClick={(e) => (e.preventDefault(), onOpen(item.id))} style={{ display: 'block', height: 28 }}>
              {item.label}
            </a>
          )}
        </SortableSideList>
      </ul>
    </div>,
  )
  return { onReorder, onOpen }
}
const link = (name: string) => screen.getByRole('link', { name })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A mouse drag from one row's middle to another's, in steps, with the pointer and mouse events a browser sends. */
async function drag(from: HTMLElement, to: HTMLElement, dy = 0, thenClick = false) {
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const x = a.left + a.width / 2
  const init = (y: number) => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 })
  const pointer = (y: number) => ({ ...init(y), pointerId: 1, isPrimary: true, pointerType: 'mouse' })
  const start = a.top + a.height / 2
  from.dispatchEvent(new PointerEvent('pointerdown', pointer(start)))
  from.dispatchEvent(new MouseEvent('mousedown', init(start)))
  const target = b.top + b.height / 2 + dy
  for (let i = 1; i <= 8; i++) {
    const y = start + ((target - start) * i) / 8
    document.dispatchEvent(new PointerEvent('pointermove', pointer(y)))
    document.dispatchEvent(new MouseEvent('mousemove', init(y)))
    await wait(16)
  }
  document.dispatchEvent(new PointerEvent('pointerup', pointer(target)))
  document.dispatchEvent(new MouseEvent('mouseup', init(target)))
  // As a browser does: the click comes in the same task, after React has handled the drop (microtasks).
  let click: MouseEvent | null = null
  if (thenClick) {
    await Promise.resolve()
    await Promise.resolve()
    click = new MouseEvent('click', { bubbles: true, cancelable: true })
    from.dispatchEvent(click)
  }
  await wait(50)
  return click
}

describe('SortableSideList (spec 5.1: drag to reorder)', () => {
  it('a mouse drag drops a row where it lands', async () => {
    const { onReorder, onOpen } = mount()
    await drag(link('general'), link('alpha'), -6)
    expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b', 'm'])
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('the browser’s own link dragging stays out of the way (it would cancel ours mid-gesture)', () => {
    mount()
    const native = new DragEvent('dragstart', { bubbles: true, cancelable: true })
    link('general').dispatchEvent(native)
    expect(native.defaultPrevented).toBe(true)
  })

  it('the click a drag ends with neither opens the row nor follows the link (no page load)', async () => {
    const { onReorder, onOpen } = mount()
    const click = await drag(link('general'), link('alpha'), -6, true)
    expect(onReorder).toHaveBeenCalled()
    expect(click?.defaultPrevented).toBe(true)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a click still opens the row', async () => {
    const { onReorder, onOpen } = mount()
    await userEvent.click(link('backend'))
    expect(onOpen).toHaveBeenCalledWith('b')
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('keyboard: Space picks up, ↑ moves, Space drops; Esc cancels; Enter still opens', async () => {
    const { onReorder, onOpen } = mount()
    link('general').focus()
    await userEvent.keyboard(' ')
    await wait(50)
    await userEvent.keyboard('{ArrowUp}')
    await wait(50)
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b', 'm']))
    onReorder.mockClear()
    link('alpha').focus()
    await userEvent.keyboard(' ')
    await wait(50)
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Escape}')
    await wait(50)
    expect(onReorder).not.toHaveBeenCalled()
    link('backend').focus()
    await userEvent.keyboard('{Enter}')
    expect(onOpen).toHaveBeenCalledWith('b')
  })

  it('tells a screen reader how to move a row', async () => {
    mount()
    const id = link('alpha').getAttribute('aria-describedby')!
    expect(document.getElementById(id)?.textContent).toMatch(/press Space/)
  })

  it('a muted row stays among the muted: a drop above the line changes nothing', async () => {
    const { onReorder } = mount()
    await drag(link('muted-one'), link('alpha'), -6)
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('focus stays on the row I moved with the keyboard, once the list has its new order', async () => {
    function Harness() {
      const [list, setList] = useState(items)
      return (
        <div className="sf" style={{ width: 260 }}>
          <ul>
            <SortableSideList label="Channels" items={list} onReorder={(ids) => setList(ids.map((id) => list.find((i) => i.id === id)!))}>
              {(item, describedBy) => (
                <a href={`#${item.id}`} aria-describedby={describedBy} style={{ display: 'block', height: 28 }}>
                  {item.label}
                </a>
              )}
            </SortableSideList>
          </ul>
        </div>
      )
    }
    render(<Harness />)
    link('alpha').focus()
    await userEvent.keyboard(' ')
    await wait(50)
    await userEvent.keyboard('{ArrowDown}')
    await wait(50)
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['backend', 'alpha', 'general', 'muted-one']))
    await wait(100)
    expect(document.activeElement).toBe(link('alpha'))
    // Up too, where the moved row's own node is the one put back in the list.
    link('general').focus()
    await userEvent.keyboard(' ')
    await wait(50)
    await userEvent.keyboard('{ArrowUp}')
    await wait(50)
    await userEvent.keyboard('{ArrowUp}')
    await wait(50)
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['general', 'backend', 'alpha', 'muted-one']))
    await wait(100)
    expect(document.activeElement).toBe(link('general'))
  })

  it('a keyboard drag leaves clicks elsewhere alone', async () => {
    mount()
    const outside = document.createElement('a')
    outside.href = '#elsewhere'
    document.body.append(outside)
    link('alpha').focus()
    await userEvent.keyboard(' ')
    await wait(50)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    outside.dispatchEvent(click)
    await userEvent.keyboard('{Escape}')
    outside.remove()
    expect(click.defaultPrevented).toBe(false)
  })

  describe('touch (the phone drawer)', () => {
    const touch = (type: string, el: Element, x: number, y: number) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
      const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] })
      el.dispatchEvent(event)
    }
    async function touchDrag(from: HTMLElement, to: HTMLElement, holdMs: number) {
      const a = from.getBoundingClientRect()
      const b = to.getBoundingClientRect()
      const x = a.left + 20
      touch('touchstart', from, x, a.top + a.height / 2)
      await wait(holdMs)
      for (let i = 1; i <= 8; i++) {
        touch('touchmove', from, x, a.top + a.height / 2 + ((b.top - 6 - (a.top + a.height / 2)) * i) / 8)
        await wait(16)
      }
      touch('touchend', from, x, b.top - 6)
      await wait(50)
    }
    it('a finger’s pointer events alone (as Chrome sends them) don’t pick the row up on a swipe', async () => {
      const { onReorder } = mount()
      const from = link('general')
      const a = from.getBoundingClientRect()
      const at = (y: number) => ({ bubbles: true, cancelable: true, clientX: a.left + 20, clientY: y, pointerId: 2, isPrimary: true, button: 0, buttons: 1, pointerType: 'touch' })
      from.dispatchEvent(new PointerEvent('pointerdown', at(a.top + 10)))
      for (let i = 1; i <= 6; i++) {
        document.dispatchEvent(new PointerEvent('pointermove', at(a.top + 10 - i * 12)))
        await wait(16)
      }
      document.dispatchEvent(new PointerEvent('pointerup', at(a.top - 62)))
      await wait(50)
      expect(onReorder).not.toHaveBeenCalled()
    })
    it('a quick swipe scrolls instead: it doesn’t pick the row up', async () => {
      const { onReorder } = mount()
      await touchDrag(link('general'), link('alpha'), 0)
      expect(onReorder).not.toHaveBeenCalled()
    })
    it('a press and hold picks it up and a drag moves it', async () => {
      const { onReorder } = mount()
      await touchDrag(link('general'), link('alpha'), 320)
      expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b', 'm'])
    })
  })
})
