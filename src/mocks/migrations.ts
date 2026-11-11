import { DEFAULT_WORK_HOURS } from '@/lib/workHours'
import { DEFAULT_TIMEOUT_HOURS } from '@/lib/hours'
import { descriptionText, parseBody, textBody } from '@/lib/messageBody'
import { DEFAULT_COLUMNS } from '@/lib/statuses'

/**
 * Steps that bring an older saved document up to date, keyed by the version each upgrades from. A step changes the
 * document in place; it only runs on a copy, inside the transaction that then saves it.
 */
/**
 * The four roles as they were when roles became records (v24), frozen here: a permission added later must reach old
 * documents through its own step, as it does documents already at v24.
 */
const V24_ROLES = [
  {
    id: 'admin', name: 'Admin', builtIn: true,
    grants: [
      'dashboard.all', 'checkins.all', 'checkins.managed', 'projects.create', 'projects.editAll', 'projects.runAll', 'projects.postAll',
      'projects.archive', 'time.logAll', 'time.othersAll', 'cost.view', 'rates.manage', 'channels.manageAll', 'channels.settings',
      'channels.invite', 'messages.deleteAll', 'files.manageAll', 'settings.manage', 'database.manage',
    ],
  },
  { id: 'sales', name: 'Sales', builtIn: true, grants: ['dashboard.all', 'projects.create', 'projects.editAll', 'projects.postAll'] },
  { id: 'pm', name: 'Project manager', builtIn: true, grants: ['checkins.managed'] },
  { id: 'member', name: 'Member', builtIn: true, grants: ['checkins.managed'] },
]

export const migrations: Record<number, (doc: Record<string, unknown>) => void> = {
  // 35: files say whether they're a voice or video message (chat spec 6.9); none were.
  34: (doc) => {
    const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]).filter(Boolean) : [])
    const fill = (file: Record<string, unknown>) => {
      file.clip ??= null
    }
    for (const file of list(doc.attachments)) fill(file)
    for (const row of [...list(doc.messages), ...list(doc.replies)]) for (const file of list(row.attachments)) fill(file)
    for (const entry of list(doc.trash)) for (const file of list((entry.snapshot as Record<string, unknown> | undefined)?.attachments)) fill(file)
  },
  // 34: who made each channel, and when (chat spec 6.14, the intro): dated by its first message, its maker unknown.
  33: (doc) => {
    if (!Array.isArray(doc.channels)) return
    const messages = Array.isArray(doc.messages) ? (doc.messages as Record<string, unknown>[]) : []
    for (const c of doc.channels as Record<string, unknown>[]) {
      const dates = messages.filter((m) => m.channelId === c.id).map((m) => String(m.createdAt)).sort()
      c.createdAt = dates[0] ?? null
      c.createdBy = null
    }
  },
  // 33: channel pages (chat spec 6.14); no channel has one yet.
  32: (doc) => {
    doc.pages = []
    doc.pageVersions = []
    doc.pageMentions = []
  },
  // 32: single-key shortcuts can be turned off (UX Phase 5A, 5.13); everyone keeps them on.
  31: (doc) => {
    if (!Array.isArray(doc.notificationPrefs)) return
    for (const p of doc.notificationPrefs as Record<string, unknown>[]) p.singleKeyShortcuts = true
  },
  // 31: task files and formatted descriptions: a plain description becomes paragraphs, and a task has no files yet.
  30: (doc) => {
    if (!Array.isArray(doc.tickets)) return
    for (const t of doc.tickets as Record<string, unknown>[]) {
      t.descriptionBody = textBody(String(t.description ?? ''))
      t.description = descriptionText(t.descriptionBody as ReturnType<typeof textBody>)
      t.attachmentIds = []
    }
  },
  // 30: check-in goes (timer slice 3): a person's attendance days come from their timer entries.
  29: (doc) => {
    delete doc.checkIns
  },
  // 29: the timer timeout (timer slice 2): a running timer pauses after 4 hours unless the company says otherwise.
  28: (doc) => {
    const settings = typeof doc.settings === 'object' && doc.settings !== null ? (doc.settings as Record<string, unknown>) : {}
    doc.settings = { ...settings, timerTimeoutHours: settings.timerTimeoutHours ?? DEFAULT_TIMEOUT_HOURS }
  },
  // 28: pause and stop (timer slice 1): a timer entry says why it ended. Older ones were stopped (or are running);
  // manual ones never ran.
  27: (doc) => {
    for (const e of Array.isArray(doc.timeEntries) ? (doc.timeEntries as Record<string, unknown>[]) : [])
      e.endReason = e.source === 'timer' && e.endedAt ? 'stopped' : null
  },
  // 27: attendance (slice 5): no visits yet, and working hours of Sunday to Thursday, 9 to 5, Cairo time. Check-ins
  // from before have no IP, device or place, and show "—".
  26: (doc) => {
    if (!Array.isArray(doc.visits)) doc.visits = []
    const settings = typeof doc.settings === 'object' && doc.settings !== null ? (doc.settings as Record<string, unknown>) : {}
    doc.settings = { ...settings, workHours: settings.workHours ?? { ...DEFAULT_WORK_HOURS, days: [...DEFAULT_WORK_HOURS.days] } }
  },
  // 26: company settings, keeping archived records a year before they may be deleted for good (slice 4), and the
  // built-in Admin role may manage them.
  25: (doc) => {
    const settings = typeof doc.settings === 'object' && doc.settings !== null ? (doc.settings as Record<string, unknown>) : {}
    doc.settings = { ...settings, archiveRetentionDays: typeof settings.archiveRetentionDays === 'number' ? settings.archiveRetentionDays : 365 }
    const admin = Array.isArray(doc.roles) ? (doc.roles as { id?: string; builtIn?: boolean; grants?: unknown }[]).find((r) => r?.id === 'admin' && r.builtIn) : undefined
    if (admin && Array.isArray(admin.grants) && !admin.grants.includes('archive.manage')) admin.grants.push('archive.manage')
  },
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
  // 25: the audit log (slice 2) starts empty, and the built-in Admin role may read it, as Admins could see everything.
  24: (doc) => {
    if (!Array.isArray(doc.audit)) doc.audit = []
    const admin = Array.isArray(doc.roles) ? (doc.roles as { id?: string; builtIn?: boolean; grants?: unknown }[]).find((r) => r?.id === 'admin' && r.builtIn) : undefined
    if (admin && Array.isArray(admin.grants) && !admin.grants.includes('audit.view')) admin.grants.push('audit.view')
  },
  // 24: roles become records (slice 1). The four built-in roles are stored with the rights they had, and each person
  // holds the one role they had; an unknown role reads as Member, as the old code treated it.
  23: (doc) => {
    if (!Array.isArray(doc.roles)) doc.roles = structuredClone(V24_ROLES)
    const known = new Set(['admin', 'sales', 'pm', 'member'])
    for (const user of Array.isArray(doc.users) ? (doc.users as Record<string, unknown>[]).filter(Boolean) : []) {
      if (!Array.isArray(user.roleIds)) user.roleIds = [typeof user.role === 'string' && known.has(user.role) ? user.role : 'member']
      delete user.role
    }
  },
  // 23: notification preferences (spec 6.11), none yet; a channel level equal to the default it had (a channel:
  // mentions, a DM: all) now follows the default, so it moves with the person's new default level.
  22: (doc) => {
    if (!Array.isArray(doc.notificationPrefs)) doc.notificationPrefs = []
    const kinds = new Map((Array.isArray(doc.channels) ? (doc.channels as { id: string; kind: string }[]).filter(Boolean) : []).map((c) => [c.id, c.kind]))
    for (const states of Object.values((doc.channelState ?? {}) as Record<string, Record<string, { notifyLevel?: unknown }>>)) {
      for (const [channelId, state] of Object.entries(states ?? {})) {
        if (!state) continue
        const old = kinds.get(channelId) === 'dm' ? 'all' : 'mentions'
        if (state.notifyLevel === old || state.notifyLevel === undefined) state.notifyLevel = null
      }
    }
  },
  // 22: a sidebar order holds `ids` (channels, or projects for the Projects section) instead of `channelIds`.
  21: (doc) => {
    for (const order of Array.isArray(doc.sidebarOrders) ? (doc.sidebarOrders as Record<string, unknown>[]).filter(Boolean) : []) {
      order.ids ??= Array.isArray(order.channelIds) ? order.channelIds : []
      delete order.channelIds
    }
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
