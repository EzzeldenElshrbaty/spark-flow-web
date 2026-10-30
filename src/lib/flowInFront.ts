/** What a tab says to the others: it's in front or not, or it just opened and asks who is. */
type Note = { tab: string; front: boolean } | { tab: string; ask: true }

const CHANNEL = 'spark-flow-front'
/** A tab in front says so this often, so one that vanished without a word stops counting after `STALE_MS`. */
const BEAT_MS = 20_000
const STALE_MS = 60_000

export type FrontWatch = {
  /** Whether this tab or another Flow tab in this browser is the one in front. */
  anyInFront(): boolean
  stop(): void
}

/**
 * Whether any Flow tab is in front (spec 6.11: desktop notifications only while Flow is in the background). Each tab
 * tells the others over a BroadcastChannel when it comes to the front or leaves it, and keeps saying so while in front;
 * a new tab asks. Without BroadcastChannel only this tab is known.
 */
export function watchFlowInFront({
  inFront,
  Broadcast = globalThis.BroadcastChannel ?? null,
  target,
  doc = target,
}: {
  inFront: () => boolean
  Broadcast?: typeof BroadcastChannel | null
  /** The window: focus, blur and pagehide. */
  target: EventTarget
  /** The document: visibilitychange. */
  doc?: EventTarget
}): FrontWatch {
  const id = crypto.randomUUID()
  // Other tabs in front, by when they last said so.
  const others = new Map<string, number>()
  const channel = Broadcast ? new Broadcast(CHANNEL) : null
  const post = (note: Note) => channel?.postMessage(note)
  const say = () => post({ tab: id, front: inFront() })
  const leave = () => post({ tab: id, front: false })

  if (channel)
    channel.onmessage = ({ data }: MessageEvent<Note>) => {
      if ('ask' in data) {
        if (inFront()) say()
      } else if (data.front) others.set(data.tab, Date.now())
      else others.delete(data.tab)
    }
  const listeners: [EventTarget, string, () => void][] = [
    [target, 'focus', say],
    [target, 'blur', say],
    [doc, 'visibilitychange', say],
    [target, 'pagehide', leave],
  ]
  listeners.forEach(([on, type, fn]) => on.addEventListener(type, fn))
  const beat = setInterval(() => inFront() && say(), BEAT_MS)
  post({ tab: id, ask: true })

  return {
    anyInFront: () => inFront() || [...others.values()].some((at) => Date.now() - at < STALE_MS),
    stop() {
      clearInterval(beat)
      listeners.forEach(([on, type, fn]) => on.removeEventListener(type, fn))
      leave()
      channel?.close()
    },
  }
}
