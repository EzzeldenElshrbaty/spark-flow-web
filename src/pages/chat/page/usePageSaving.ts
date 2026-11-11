import { useEffect, useRef, useState } from 'react'
import { useClaimPage, useReleasePage, useSavePage } from '@/api/pages'
import type { PageHold, PageView } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { PAGE_CLAIM_EVERY_MS, PAGE_HOLD_MS, PAGE_SAVE_AFTER_MS, pageText, type PageBody } from '@/lib/pageBody'

/**
 * Where my changes are (chat spec 6.14 §6.3): `saving` and `saved` as they go; `conflict` a 409 (someone else holds
 * the page or saved first: read-only until I copy my changes or load the latest); `invalid` a 400 or 403 (its sentence;
 * no retry until I change something); `failed` the network (retried at the next pause, or with Try again).
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'invalid' | 'failed'
/** `dirty`: I have changes the page doesn't have yet (a save on its way included). */
export type SaverSnapshot = { state: SaveState; error: string | null; dirty: boolean }

export const NETWORK_SENTENCE = 'Couldn’t save the page. Check your connection.'

type SaverDeps = {
  save: (body: PageBody, baseVersion: number) => Promise<PageView>
  /** Claims or renews my hold; answers whoever holds the page. */
  claim: () => Promise<PageHold | null>
  me: string
  nameOf: (userId: string) => string
  baseVersion: number
  onChange: (snapshot: SaverSnapshot) => void
}

/**
 * The editor's saving, without React: a save 1 s after the last change (never two at once), a claim on the first
 * change after a pause and at most every 5 s while typing, and the refusals above. Plain timers, so tests drive it
 * with fake ones.
 */
export function createPageSaver(deps: SaverDeps) {
  let base = deps.baseVersion
  /** What's in my editor now, and what of it the page doesn't have yet (null: nothing). */
  let latest: PageBody = []
  let pending: PageBody | null = null
  let sending = false
  /** The save on its way, settled either way: what `drain` waits for. */
  let inflight: Promise<unknown> = Promise.resolve()
  /**
   * Until when this tab holds the page, by my clock: 60 s from its last claim or save that said so (final review). Only
   * then does leaving let it go, so an old hold of mine never drops my other tab's newer one.
   */
  let heldUntil = -Infinity
  const holdNow = () => (heldUntil = Date.now() + PAGE_HOLD_MS)
  /** I lost my rights (`lose`): a save already on its way that lands still counts, and says so. */
  let lost = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastClaim = -Infinity
  let snapshot: SaverSnapshot = { state: 'idle', error: null, dirty: false }

  const set = (patch: Partial<Omit<SaverSnapshot, 'dirty'>>) => {
    snapshot = { ...snapshot, ...patch, dirty: pending !== null || sending }
    deps.onChange(snapshot)
  }
  const stop = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const stopped = () => snapshot.state === 'conflict'

  async function claim() {
    if (Date.now() - lastClaim < PAGE_CLAIM_EVERY_MS) return
    lastClaim = Date.now()
    try {
      // The server answers only a live hold: no clock of mine is asked (polish pass).
      const hold = await deps.claim()
      if (hold?.userId === deps.me) holdNow()
      else heldUntil = -Infinity
      if (hold && hold.userId !== deps.me && !stopped()) {
        stop()
        set({ state: 'conflict', error: `${deps.nameOf(hold.userId)} started editing first. Your last changes aren’t saved.` })
      }
    } catch {
      // The save that follows says what's wrong.
    }
  }

  async function flush(): Promise<void> {
    stop()
    if (stopped() || sending || pending === null || snapshot.state === 'invalid') return
    const body = pending
    sending = true
    pending = null
    set({ state: 'saving', error: null })
    try {
      const sent = deps.save(body, base)
      inflight = sent.catch(() => {})
      const view = await sent
      base = view.version
      holdNow()
      sending = false
      if (stopped()) return lost && pending === null ? set({ state: 'saved', error: null }) : set({})
      set({ state: pending === null ? 'saved' : 'saving' })
      // Typed while it was on its way, with the pause already over: that goes now.
      if (pending !== null && !timer) await flush()
    } catch (error) {
      sending = false
      // Typed while it was on its way: the refusal was for the older text (polish pass).
      const newer = pending !== null && pending !== body
      pending ??= body
      // Stopped meanwhile (a 409's choice, or lost rights): that stays what the bar says (final review).
      if (stopped()) return set({})
      if (newer && error instanceof ApiError && error.status === 400) return flush()
      if (error instanceof ApiError && error.status === 409) {
        heldUntil = -Infinity
        set({ state: 'conflict', error: error.detail ?? error.title })
      } else if (error instanceof ApiError && (error.status === 400 || error.status === 403)) set({ state: 'invalid', error: error.detail ?? error.title })
      else set({ state: 'failed', error: NETWORK_SENTENCE })
    }
  }

  return {
    /** The editor changed: save after the pause, claiming the page as I go. Ignored while a 409 waits for my choice. */
    change(body: PageBody) {
      if (stopped()) return
      latest = body
      pending = body
      // A change is a new try after a 400.
      set(snapshot.state === 'invalid' ? { state: 'idle', error: null } : {})
      void claim()
      stop()
      timer = setTimeout(() => void flush(), PAGE_SAVE_AFTER_MS)
    },
    /** Saves now (the editor lost focus, Try again). */
    flush,
    /** Leaving: waits for the save on its way, then sends what's left. */
    async drain() {
      while (sending) await inflight
      await flush()
    },
    /** I may no longer edit: saving stops with `sentence`, and my text stays for Copy my changes (as a 409). */
    lose(sentence: string) {
      stop()
      lost = true
      set({ state: 'conflict', error: sentence })
    },
    held: () => Date.now() < heldUntil,
    /** The page was let go (closing the tab): I hold nothing, and my next change claims at once. */
    letGo() {
      heldUntil = -Infinity
      lastClaim = -Infinity
    },
    /** My editor now holds the page at `version` (Load the latest, or someone else's save while I had no changes). */
    loadLatest(version: number) {
      stop()
      base = version
      pending = null
      lastClaim = -Infinity
      set({ state: 'idle', error: null })
    },
    /** My editor's text, for Copy my changes. */
    myText: () => pageText(latest),
    /** Starts from the page as loaded. */
    start(body: PageBody, version: number) {
      latest = body
      base = version
    },
    /** The version my editor is based on. */
    base: () => base,
    dispose: stop,
    snapshot: () => snapshot,
  }
}

export type PageSaver = ReturnType<typeof createPageSaver>

/**
 * The Page tab's saving (chat spec 6.14 §6.4): the saver above on the page's api, its state for the page bar. Leaving
 * the tab saves what's left and lets the page go if this tab held it; closing the browser tab lets it go when
 * everything is saved, or saves what's left (polish pass).
 */
export function usePageSaving({ channelId, view, me, nameOf }: { channelId: string; view: PageView | undefined; me: string; nameOf: (userId: string) => string }) {
  const save = useSavePage()
  const claim = useClaimPage()
  const release = useReleasePage()
  const [snapshot, setSnapshot] = useState<SaverSnapshot>({ state: 'idle', error: null, dirty: false })
  const deps = useRef({ save, claim, nameOf })
  useEffect(() => {
    deps.current = { save, claim, nameOf }
  })
  const [saver] = useState(() =>
    createPageSaver({
      save: (body, baseVersion) => deps.current.save.mutateAsync({ channelId, body, baseVersion }),
      claim: () => deps.current.claim.mutateAsync(channelId).then((r) => r.editing),
      me,
      nameOf: (id) => deps.current.nameOf(id),
      baseVersion: view?.version ?? 0,
      onChange: setSnapshot,
    }),
  )
  const started = useRef(false)
  useEffect(() => {
    if (view && !started.current) {
      started.current = true
      saver.start(view.body, view.version)
    }
  }, [saver, view])

  // Leaving: what's left goes once the save on its way has landed, then the page is let go if this tab held it (best
  // effort; the hold ends by itself after 60 s).
  const releaseRef = useRef(release.mutate)
  useEffect(() => {
    releaseRef.current = release.mutate
  })
  useEffect(() => {
    const hide = () => {
      if (!saver.snapshot().dirty && saver.held()) {
        releaseRef.current(channelId)
        // The page may come back from the browser's cache: it holds nothing now (final review).
        saver.letGo()
      } else void saver.flush()
    }
    addEventListener('pagehide', hide)
    return () => {
      removeEventListener('pagehide', hide)
      const leaving = saver.drain()
      saver.dispose()
      void leaving.finally(() => {
        if (saver.held()) releaseRef.current(channelId)
      })
    }
  }, [saver, channelId])
  return { ...snapshot, saver }
}
