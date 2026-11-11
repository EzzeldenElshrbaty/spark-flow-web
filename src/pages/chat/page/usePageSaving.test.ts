import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageHold, PageView } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { PAGE_HOLD_MS, type PageBody } from '@/lib/pageBody'
import { createPageSaver, type SaverSnapshot } from './usePageSaving'

const body = (text: string): PageBody => [{ type: 'p', children: [{ type: 'text', text }] }]
const view = (version: number): PageView => ({ channelId: 'c-general', body: [], version, updatedAt: null, updatedBy: 'u-1', editors: ['u-1'], editing: null })
const refusal = (status: number, detail: string) => new ApiError({ title: 'Refused', status, detail })
const hold = (userId: string): PageHold => ({ userId, until: new Date(Date.now() + 60_000).toISOString() })

function setup() {
  const save = vi.fn(async (_body: PageBody, base: number) => view(base + 1))
  const claim = vi.fn(async (): Promise<PageHold | null> => hold('u-1'))
  const states: SaverSnapshot[] = []
  const saver = createPageSaver({ save, claim, me: 'u-1', nameOf: (id) => (id === 'u-2' ? 'Nour El-Sayed' : id), baseVersion: 0, onChange: (s) => states.push(s) })
  return { save, claim, saver, last: () => states.at(-1)! }
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-10T09:00:00.000Z') })
})
afterEach(() => vi.useRealTimers())

describe('saving a channel’s page (chat spec 6.14 §6.4)', () => {
  it('saves 1 s after the last change, not on every key', async () => {
    const { save, saver, last } = setup()
    saver.change(body('a'))
    await vi.advanceTimersByTimeAsync(500)
    saver.change(body('ab'))
    await vi.advanceTimersByTimeAsync(999)
    expect(save).not.toHaveBeenCalled()
    expect(last()).toMatchObject({ dirty: true })
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledExactlyOnceWith(body('ab'), 0)
    expect(last()).toEqual({ state: 'saved', error: null, dirty: false })
    saver.change(body('abc'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenLastCalledWith(body('abc'), 1)
  })

  it('claims on the first change and at most every 5 s while typing', async () => {
    const { claim, saver } = setup()
    saver.change(body('a'))
    expect(claim).toHaveBeenCalledTimes(1)
    for (let n = 0; n < 4; n++) {
      await vi.advanceTimersByTimeAsync(1000)
      saver.change(body(`a${n}`))
    }
    expect(claim).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    saver.change(body('later'))
    expect(claim).toHaveBeenCalledTimes(2)
  })

  it('a 400 shows its sentence and isn’t retried until the next change', async () => {
    const { save, saver, last } = setup()
    save.mockRejectedValueOnce(refusal(400, 'This page is too long. Shorten it to save.'))
    saver.change(body('long'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(last()).toEqual({ state: 'invalid', error: 'This page is too long. Shorten it to save.', dirty: true })
    await saver.flush()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).toHaveBeenCalledTimes(1)
    saver.change(body('short'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(last().state).toBe('saved')
  })

  it('a 409 keeps my text, stops saving and offers both buttons', async () => {
    const { save, saver, last } = setup()
    save.mockRejectedValueOnce(refusal(409, 'Nour El-Sayed saved changes before you. Your last changes aren’t saved.'))
    saver.change(body('Mine'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(last()).toEqual({ state: 'conflict', error: 'Nour El-Sayed saved changes before you. Your last changes aren’t saved.', dirty: true })
    saver.change(body('Mine, more'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(saver.myText()).toBe('Mine')
    saver.loadLatest(4)
    expect(last()).toEqual({ state: 'idle', error: null, dirty: false })
    saver.change(body('Again'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenLastCalledWith(body('Again'), 4)
  })

  it('someone else’s hold, found when I start typing again, stops me before I save', async () => {
    const { save, claim, saver, last } = setup()
    claim.mockResolvedValueOnce(hold('u-2'))
    saver.change(body('Mine'))
    await vi.advanceTimersByTimeAsync(0)
    expect(last()).toEqual({ state: 'conflict', error: 'Nour El-Sayed started editing first. Your last changes aren’t saved.', dirty: true })
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).not.toHaveBeenCalled()
  })

  it('a hold the claim reports stops me even when my clock says it ended (polish pass)', async () => {
    const { save, claim, saver, last } = setup()
    claim.mockResolvedValueOnce({ userId: 'u-2', until: new Date(Date.now() - 60_000).toISOString() })
    saver.change(body('Mine'))
    await vi.advanceTimersByTimeAsync(2000)
    expect(last().state).toBe('conflict')
    expect(save).not.toHaveBeenCalled()
  })

  it('a network failure retries at the next pause', async () => {
    const { save, saver, last } = setup()
    save.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    saver.change(body('a'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(last()).toEqual({ state: 'failed', error: 'Couldn’t save the page. Check your connection.', dirty: true })
    saver.change(body('ab'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenLastCalledWith(body('ab'), 0)
    expect(last().state).toBe('saved')
  })

  it('flush saves at once', async () => {
    const { save, saver, last } = setup()
    saver.change(body('a'))
    await saver.flush()
    expect(save).toHaveBeenCalledExactlyOnceWith(body('a'), 0)
    expect(last().state).toBe('saved')
  })

  it('a change made while a save is on its way goes in the next one', async () => {
    const { save, saver } = setup()
    let land: (v: PageView) => void = () => {}
    save.mockImplementationOnce(() => new Promise((resolve) => (land = resolve)))
    saver.change(body('a'))
    await vi.advanceTimersByTimeAsync(1000)
    saver.change(body('ab'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
    land(view(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenLastCalledWith(body('ab'), 1)
  })

  // Polish pass (P1): a tab lets go only of a hold it has, and only once what it sent has landed.
  it('holds the page only once my claim or save says so', async () => {
    const { claim, saver } = setup()
    expect(saver.held()).toBe(false)
    claim.mockResolvedValueOnce(hold('u-2'))
    saver.change(body('a'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saver.held()).toBe(false)
    saver.loadLatest(1)
    await vi.advanceTimersByTimeAsync(5000)
    saver.change(body('b'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saver.held()).toBe(true)
  })

  it('drain waits for a save on its way, then sends what’s left', async () => {
    const { save, saver } = setup()
    let land: (v: PageView) => void = () => {}
    save.mockImplementationOnce(() => new Promise((resolve) => (land = resolve)))
    saver.change(body('a'))
    await vi.advanceTimersByTimeAsync(1000)
    saver.change(body('ab'))
    let drained = false
    void saver.drain().then(() => (drained = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(drained).toBe(false)
    land(view(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenLastCalledWith(body('ab'), 1)
    expect(drained).toBe(true)
  })

  // Polish pass (P3): the refusal was for the older text; the newer one may well be fine.
  it('a newer edit waiting behind a 400 goes at once', async () => {
    const { save, saver, last } = setup()
    let refuse: (e: unknown) => void = () => {}
    save.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)))
    saver.change(body('too long'))
    await vi.advanceTimersByTimeAsync(1000)
    saver.change(body('short'))
    await vi.advanceTimersByTimeAsync(1000)
    refuse(refusal(400, 'This page is too long. Shorten it to save.'))
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenLastCalledWith(body('short'), 0)
    expect(last()).toEqual({ state: 'saved', error: null, dirty: false })
  })

  // Polish pass (P9): losing edit rights stops saving and keeps my text, as a conflict does.
  const LOST = 'You can’t edit this page anymore. Your last changes aren’t saved.'

  it('a save refused after I lost my rights keeps me stopped (final review)', async () => {
    const { save, saver, last } = setup()
    let refuse: (e: unknown) => void = () => {}
    save.mockImplementationOnce(() => new Promise((_, reject) => (refuse = reject)))
    saver.change(body('Mine'))
    await vi.advanceTimersByTimeAsync(1000)
    saver.lose(LOST)
    refuse(refusal(400, 'This channel is archived.'))
    await vi.advanceTimersByTimeAsync(0)
    expect(last()).toEqual({ state: 'conflict', error: LOST, dirty: true })
  })

  it('a save that lands after I lost my rights says it’s saved (final review)', async () => {
    const { save, saver, last } = setup()
    let land: (v: PageView) => void = () => {}
    save.mockImplementationOnce(() => new Promise((resolve) => (land = resolve)))
    saver.change(body('Mine'))
    await vi.advanceTimersByTimeAsync(1000)
    saver.lose(LOST)
    land(view(1))
    await vi.advanceTimersByTimeAsync(0)
    expect(last()).toEqual({ state: 'saved', error: null, dirty: false })
  })

  it('my hold runs out by itself, and a 409 or letting go ends it (final review)', async () => {
    const { save, saver } = setup()
    saver.change(body('a'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(saver.held()).toBe(true)
    await vi.advanceTimersByTimeAsync(PAGE_HOLD_MS)
    expect(saver.held()).toBe(false)
    saver.change(body('b'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(saver.held()).toBe(true)
    saver.letGo()
    expect(saver.held()).toBe(false)
    save.mockRejectedValueOnce(refusal(409, 'Nour El-Sayed saved changes before you. Your last changes aren’t saved.'))
    saver.change(body('c'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saver.held()).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(saver.held()).toBe(false)
  })

  it('letting go lets the next change claim at once (final review)', async () => {
    const { claim, saver } = setup()
    saver.change(body('a'))
    expect(claim).toHaveBeenCalledTimes(1)
    saver.letGo()
    saver.change(body('ab'))
    expect(claim).toHaveBeenCalledTimes(2)
  })

  it('lose stops saving with its sentence and keeps my text', async () => {
    const { save, saver, last } = setup()
    saver.change(body('Mine'))
    saver.lose('You can’t edit this page anymore. Your last changes aren’t saved.')
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
    expect(last()).toEqual({ state: 'conflict', error: 'You can’t edit this page anymore. Your last changes aren’t saved.', dirty: true })
    expect(saver.myText()).toBe('Mine')
  })
})
