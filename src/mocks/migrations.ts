import { DEFAULT_COLUMNS } from '@/lib/statuses'

/**
 * Steps that bring an older saved document up to date, keyed by the version each upgrades from. A step changes the
 * document in place; it only runs on a copy, inside the transaction that then saves it.
 */
export const migrations: Record<number, (doc: Record<string, unknown>) => void> = {
  // 4: channel read state per person. What was read so far is everyone's starting point, so nobody's chat turns unread.
  3: (doc) => {
    const reads = (doc.reads ?? {}) as Record<string, string>
    // A broken file may have no list of people; it fails the shape check after the upgrade, it mustn't crash here.
    const users = Array.isArray(doc.users) ? (doc.users as { id?: unknown }[]) : []
    const ids = new Set([String(doc.currentUserId), ...users.filter((u) => u?.id != null).map((u) => String(u.id))])
    doc.reads = Object.fromEntries([...ids].map((id) => [id, { ...reads }]))
  },
  // 5: board columns have an id and a type; history starts empty. Old names and order stay; types come from the ids.
  4: (doc) => {
    for (const project of (doc.projects as Record<string, unknown>[]) ?? []) {
      const own = Array.isArray(project.board) ? (project.board as { status: string; label: string }[]) : []
      const seen = new Set<string>()
      const board = []
      for (const c of own) {
        const standard = DEFAULT_COLUMNS.find((d) => d.id === c.status)
        if (!standard || seen.has(c.status)) continue
        seen.add(c.status)
        board.push({ id: c.status, label: c.label?.trim() || standard.label, category: standard.category })
      }
      project.board = [...board, ...DEFAULT_COLUMNS.filter((d) => !seen.has(d.id)).map((d) => ({ ...d }))]
    }
    doc.activity = []
  },
  // 6: rates keep their history. Each old rate is a row with an id, in effect since the start of time, so past cost
  // stays what it was.
  5: (doc) => {
    const rates = Array.isArray(doc.rates) ? (doc.rates as Record<string, unknown>[]) : []
    doc.rates = rates.map((r) => ({ id: `r-${String(r.userId)}`, ...r, effectiveFrom: typeof r.effectiveFrom === 'string' ? r.effectiveFrom : '1970-01-01T00:00:00.000Z' }))
  },
  // 7: messages are numbered per channel (seq) and each person's read time becomes a read seq, with star, mute and
  // notification level starting unset. What was read stays read.
  6: (doc) => {
    const messages = Array.isArray(doc.messages) ? (doc.messages as { id: string; channelId: string; createdAt: string; seq?: number }[]) : []
    const byChannel = new Map<string, typeof messages>()
    for (const m of messages) byChannel.set(m.channelId, [...(byChannel.get(m.channelId) ?? []), m])
    for (const own of byChannel.values()) {
      own.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1))
      own.forEach((m, i) => (m.seq = i + 1))
    }
    doc.messages = messages
    const reads = (doc.reads ?? {}) as Record<string, Record<string, string>>
    doc.channelState = Object.fromEntries(
      Object.entries(reads).map(([userId, channels]) => [
        userId,
        Object.fromEntries(
          Object.entries(channels ?? {}).map(([channelId, readAt]) => {
            const read = (byChannel.get(channelId) ?? []).filter((m) => m.createdAt <= readAt)
            return [channelId, { lastReadSeq: read.length ? read[read.length - 1].seq : 0, starred: false, muted: false, notifyLevel: 'all' }]
          }),
        ),
      ]),
    )
    delete doc.reads
  },
}

/** The document brought up to `to`, or null when a step on the way is missing. */
export function migrate(doc: Record<string, unknown>, to: number): Record<string, unknown> | null {
  const copy = structuredClone(doc)
  for (let v = Number(copy.version); v < to; v++) {
    const step = migrations[v]
    if (!step) return null
    step(copy)
    copy.version = v + 1
  }
  return copy
}
