import { parseBody } from '@/lib/messageBody'
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
  // 8: messages and replies keep their text as structured rich text too (spec §7), worked out from the text.
  7: (doc) => {
    for (const name of ['messages', 'replies']) {
      const rows = Array.isArray(doc[name]) ? (doc[name] as { content?: unknown; deletedAt?: unknown; body?: unknown }[]) : []
      for (const row of rows) row.body = row.deletedAt ? [] : parseBody(typeof row.content === 'string' ? row.content : '')
      doc[name] = rows
    }
  },
  // 9: drafts are kept on the server (spec 6.8); there are none yet.
  8: (doc) => {
    doc.drafts = []
  },
  // 10: a delete keeps what it took for the Undo window (spec 6.3); nothing is in it yet.
  9: (doc) => {
    doc.trash = []
  },
  // 11: thread follows (spec 6.7). None are chosen yet: everyone follows by the defaults.
  10: (doc) => {
    doc.threadFollows = []
  },
  // 12: Activity items (spec 6.12), none yet; a channel's level that was "all" becomes "mentions", its new default
  // (nobody could choose a level before, spec 6.11). A DM stays "all".
  11: (doc) => {
    doc.notifications = []
    const kinds = new Map((Array.isArray(doc.channels) ? (doc.channels as { id: string; kind: string }[]) : []).map((c) => [c.id, c.kind]))
    for (const states of Object.values((doc.channelState ?? {}) as Record<string, Record<string, { notifyLevel?: string }>>)) {
      for (const [channelId, state] of Object.entries(states ?? {})) if (kinds.get(channelId) !== 'dm' && state?.notifyLevel === 'all') state.notifyLevel = 'mentions'
    }
  },
  // 13: a channel's description and who can post in it (spec 6.10, §9): none yet, and everyone who may. A value that
  // can't be used becomes the default, so it never blocks an edit later.
  12: (doc) => {
    for (const channel of Array.isArray(doc.channels) ? (doc.channels as Record<string, unknown>[]) : []) {
      if (!channel) continue
      if (typeof channel.description !== 'string') channel.description = ''
      channel.whoCanPost = channel.whoCanPost === 'admins' ? 'admins' : 'everyone'
    }
  },
  // 14: email invites (spec 6.10, §7 Invitation), none yet; the seed's #general is the default channel new people join.
  13: (doc) => {
    if (!Array.isArray(doc.invitations)) doc.invitations = []
    for (const channel of Array.isArray(doc.channels) ? (doc.channels as Record<string, unknown>[]) : []) {
      if (!channel) continue
      channel.isDefault = channel.isDefault === true || (channel.id === 'c-general' && channel.isPrivate !== true)
    }
  },
  // 15: a file's details (spec 6.9): who uploaded it (the project file's or comment's author, else the document's
  // person), a title after its name, no description, a clean scan; the copies in messages and replies too.
  14: (doc) => {
    const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]).filter(Boolean) : [])
    const uploader = new Map<unknown, unknown>()
    for (const f of list(doc.projectFiles)) uploader.set(f.attachmentId, f.uploadedBy)
    for (const c of list(doc.comments)) for (const id of Array.isArray(c.attachmentIds) ? c.attachmentIds : []) if (!uploader.has(id)) uploader.set(id, c.authorId)
    const fill = (file: Record<string, unknown>) => {
      file.uploadedBy ??= uploader.get(file.id) ?? doc.currentUserId
      file.title ??= file.name
      file.description ??= ''
      file.scanStatus ??= 'clean'
      file.thumbUrl ??= null
      file.previewUrl ??= null
      file.deletedAt ??= null
    }
    for (const file of list(doc.attachments)) fill(file)
    for (const row of [...list(doc.messages), ...list(doc.replies)]) for (const file of list(row.attachments)) fill(file)
    for (const entry of list(doc.trash)) for (const file of list((entry.snapshot as Record<string, unknown> | undefined)?.attachments)) fill(file)
  },
  // 16: reminders and scheduled messages (spec §7), none yet.
  15: (doc) => {
    if (!Array.isArray(doc.reminders)) doc.reminders = []
    if (!Array.isArray(doc.scheduled)) doc.scheduled = []
  },
  // 17: a reminder lives on its saved item (spec 6.5, "Reminders also appear in Saved"): each becomes one, In progress.
  16: (doc) => {
    const reminders = Array.isArray(doc.reminders) ? (doc.reminders as Record<string, unknown>[]).filter(Boolean) : []
    doc.saved = reminders.map((r) => ({ id: r.id, userId: r.userId, workspaceId: r.workspaceId, target: r.target, status: 'inProgress', remindAt: r.remindAt, firedAt: r.firedAt ?? null, savedAt: r.remindAt }))
    delete doc.reminders
  },
  // 21: each person's sidebar order (spec 5.1 drag to reorder), none yet.
  20: (doc) => {
    if (!Array.isArray(doc.sidebarOrders)) doc.sidebarOrders = []
  },
  // 20: pins (spec §7 Pin), file folders (spec 6.9) and bookmarks (§7 Bookmark), none yet; every file is in no folder.
  19: (doc) => {
    if (!Array.isArray(doc.pins)) doc.pins = []
    if (!Array.isArray(doc.folders)) doc.folders = []
    if (!Array.isArray(doc.bookmarks)) doc.bookmarks = []
    const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]).filter(Boolean) : [])
    const fill = (file: Record<string, unknown>) => {
      file.folderId ??= null
    }
    for (const file of list(doc.attachments)) fill(file)
    for (const row of [...list(doc.messages), ...list(doc.replies)]) for (const file of list(row.attachments)) fill(file)
    for (const entry of list(doc.trash)) for (const file of list((entry.snapshot as Record<string, unknown> | undefined)?.attachments)) fill(file)
  },
  // 19: a saved item may be a /remind note (spec 6.8); every stored one is a message or reply already.
  18: () => {},
  // 18: files say whether they're a text snippet (spec 6.9); none were.
  17: (doc) => {
    const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]).filter(Boolean) : [])
    const fill = (file: Record<string, unknown>) => {
      file.snippet ??= null
    }
    for (const file of list(doc.attachments)) fill(file)
    for (const row of [...list(doc.messages), ...list(doc.replies)]) for (const file of list(row.attachments)) fill(file)
    for (const entry of list(doc.trash)) for (const file of list((entry.snapshot as Record<string, unknown> | undefined)?.attachments)) fill(file)
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
