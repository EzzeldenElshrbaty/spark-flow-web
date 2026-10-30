import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchFlowInFront, type FrontWatch } from './flowInFront'

/** BroadcastChannel between the "tabs" of one test, delivered at once (the real one is asynchronous). */
class FakeBroadcast {
  static open: FakeBroadcast[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  name: string
  constructor(name: string) {
    this.name = name
    FakeBroadcast.open.push(this)
  }
  postMessage(data: unknown) {
    if (!FakeBroadcast.open.includes(this)) return
    for (const other of FakeBroadcast.open) if (other !== this && other.name === this.name) other.onmessage?.({ data } as MessageEvent)
  }
  close() {
    FakeBroadcast.open = FakeBroadcast.open.filter((c) => c !== this)
  }
}

/** One tab: whether it's in front, and the window events it fires. */
function tab() {
  const target = new EventTarget()
  const state = { front: false }
  const watch = watchFlowInFront({ inFront: () => state.front, Broadcast: FakeBroadcast as unknown as typeof BroadcastChannel, target })
  const channel = FakeBroadcast.open.at(-1)!
  return {
    watch,
    /** Gone without a word: its channel is dead, its timers too. */
    crash() {
      FakeBroadcast.open = FakeBroadcast.open.filter((c) => c !== channel)
      watch.stop()
    },
    show() {
      state.front = true
      target.dispatchEvent(new Event('focus'))
    },
    hide() {
      state.front = false
      target.dispatchEvent(new Event('blur'))
    },
    close() {
      target.dispatchEvent(new Event('pagehide'))
      watch.stop()
    },
  }
}

let watches: FrontWatch[] = []
beforeEach(() => {
  vi.useFakeTimers()
  FakeBroadcast.open = []
  watches = []
})
afterEach(() => {
  watches.forEach((w) => w.stop())
  vi.useRealTimers()
})

describe('watchFlowInFront (spec 6.11: desktop notifications only while Flow is in the background)', () => {
  it('a tab in front counts; one in the background doesn’t', () => {
    const a = tab()
    watches.push(a.watch)
    expect(a.watch.anyInFront()).toBe(false)
    a.show()
    expect(a.watch.anyInFront()).toBe(true)
  })

  it('another Flow tab in front counts for every tab, until it goes to the background or closes', () => {
    const a = tab()
    const b = tab()
    watches.push(a.watch, b.watch)
    b.show()
    expect(a.watch.anyInFront()).toBe(true)
    b.hide()
    expect(a.watch.anyInFront()).toBe(false)
    b.show()
    b.close()
    expect(a.watch.anyInFront()).toBe(false)
    // Stopping (the notifier going away) says goodbye too.
    const c = tab()
    watches.push(c.watch)
    c.show()
    c.watch.stop()
    expect(a.watch.anyInFront()).toBe(false)
  })

  it('a tab opened later learns at once that another is in front', () => {
    const b = tab()
    watches.push(b.watch)
    b.show()
    const a = tab()
    watches.push(a.watch)
    expect(a.watch.anyInFront()).toBe(true)
  })

  it('a tab that stopped answering (it crashed) stops counting after a minute; one in front keeps saying so', () => {
    const a = tab()
    const b = tab()
    const c = tab()
    watches.push(a.watch, b.watch, c.watch)
    b.show()
    c.show()
    // b goes silent without a word, as a crashed tab would; c is still there.
    b.crash()
    c.hide()
    vi.advanceTimersByTime(61_000)
    expect(a.watch.anyInFront()).toBe(false)
    c.show()
    vi.advanceTimersByTime(120_000)
    expect(a.watch.anyInFront()).toBe(true)
  })

  it('without BroadcastChannel it knows only its own tab', () => {
    const target = new EventTarget()
    const watch = watchFlowInFront({ inFront: () => true, Broadcast: null, target })
    watches.push(watch)
    expect(watch.anyInFront()).toBe(true)
  })
})
