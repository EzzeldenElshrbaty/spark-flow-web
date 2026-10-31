import type {
  ChannelMemberState,
  Draft,
  ActivityEntry,
  Attachment,
  ChatMessage,
  CheckIn,
  Comment,
  Deliverable,
  ExportBundle,
  Invitation,
  Phase,
  Role,
  AuditEvent,
  Project,
  ProjectFile,
  Rate,
  SavedItem,
  ScheduledMessage,
  Sprint,
  StoredChannel,
  Team,
  ThreadFollow,
  ThreadReply,
  Ticket,
  TimeEntry,
  User,
  Workspace,
  Pin,
  Folder,
  Bookmark,
  SidebarSection,
  NotifyLevel,
  Preferences,
} from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { memoryActor, type Actor } from './actor'
import { migrate } from './migrations'
import type { MockStore } from './store'

export const DB_VERSION = 25 // 2: the company-system document (spec §3); 3: mention read state; 4: channel reads per person; 5: typed columns, history; 6: rate history; 7: message seq, channel member state; 8: message bodies; 9: drafts; 10: deleted messages kept for Undo; 11: thread follows; 12: activity items, channel levels; 13: channel description, who can post; 14: email invites, default channels; 15: file details (uploader, title, description, scan); 16: reminders, scheduled messages; 17: reminders on saved items; 18: text snippets; 19: /remind notes; 20: pins, folders, bookmarks; 21: sidebar order; 22: sidebar order ids (projects too); 23: notification preferences, levels that follow the default; 24: roles as records, people with roleIds; 25: the audit log
/** Phase 1+2 kept the mock database in localStorage under keys starting with this. */
const LEGACY_PREFIX = 'spark-flow.mockdb.v1'

/**
 * An Activity item kept for `userId` (spec 6.12): someone else's reaction to their message or reply, or a reply in a
 * thread they follow. Its text is read from the message or reply each time, so an edit shows and a delete removes it.
 */
export type StoredNotification = {
  id: string; userId: string; kind: 'reaction' | 'thread' | 'reminder'; actorId: string; channelId: string; messageId: string
  replyId: string | null; emoji: string | null; at: string; read: boolean
}

export type DbData = {
  version: number
  currentUserId: string
  users: User[]
  workspaces: Workspace[]
  projects: Project[]
  sprints: Sprint[]
  tickets: Ticket[]
  channels: StoredChannel[]
  messages: ChatMessage[]
  replies: ThreadReply[]
  teams: Team[]
  phases: Phase[]
  deliverables: Deliverable[]
  comments: Comment[]
  attachments: Attachment[]
  projectFiles: ProjectFile[]
  timeEntries: TimeEntry[]
  checkIns: CheckIn[]
  rates: Rate[]
  /** userId -> channelId -> their own state there (read marker, star, mute). Missing means the defaults. */
  channelState: Record<string, Record<string, StoredMemberState>>
  /** userId -> ids of the mentions they have read. */
  mentionReads: Record<string, string[]>
  counters: Record<string, number> // projectId -> next ticket number
  /** Every project's history, oldest first. */
  activity: ActivityEntry[]
  /** Each person's unsent drafts: one per channel and thread root. */
  drafts: (Draft & { id: string; userId: string })[]
  /** What a delete took away, kept only for the Undo window (spec 6.3), then dropped. */
  trash: TrashEntry[]
  /** Each person's own choices to follow a thread or not (spec 6.7); without one, the defaults decide. */
  threadFollows: ThreadFollow[]
  /** Activity items stored for a person when they happen (spec 6.12): reactions to theirs, replies they follow. */
  notifications: StoredNotification[]
  /** Email invites to channels (spec 6.10, §7 Invitation), revoked ones too. */
  invitations: Invitation[]
  /** Saved messages and replies with their reminders (spec §7 SavedItem), completed and archived ones too. */
  saved: SavedItem[]
  /** Messages to send later (spec §7 ScheduledMessage), sent and failed ones too. */
  scheduled: ScheduledMessage[]
  /** Pinned messages (spec §7 Pin). */
  pins: Pin[]
  /** Workspace folders for files (spec 6.9). */
  folders: Folder[]
  /** Links in channels' tabs rows (spec §7 Bookmark). */
  bookmarks: Bookmark[]
  /** Each person's order of a sidebar section in a workspace (spec 5.1); id is `user:workspace:section`. */
  sidebarOrders: StoredSidebarOrder[]
  /** Each person's notification preferences (spec 6.11, §7 NotificationPref); id is the person's. */
  notificationPrefs: StoredPreferences[]
  /** Roles and what each grants (slice 1); who holds them is on each user (`roleIds`). */
  roles: StoredRole[]
  /** The audit log, oldest first, chained (slice 2). Only ever appended to. */
  audit: AuditEvent[]
}

/** A role as stored: how many hold it is worked out on read. */
export type StoredRole = Omit<Role, 'holders'>

/** A person's state in a channel as stored: `notifyLevel` null follows their default (spec 6.11). */
export type StoredMemberState = Omit<ChannelMemberState, 'notifyLevel' | 'notifyLevelOwn'> & { notifyLevel: NotifyLevel | null }
/** My preferences as kept: `keywordsSince` holds when each keyword (lowercased) was added, which only the server reads. */
export type StoredPreferences = Preferences & { id: string; keywordsSince?: Record<string, string> }

export type StoredSidebarOrder = { id: string; userId: string; workspaceId: string; section: SidebarSection; ids: string[] }

/** A deleted message's or reply's content, by id, with who deleted it and when. */
export type TrashEntry = {
  id: string
  kind: 'message' | 'reply'
  by: string
  at: string
  snapshot: Pick<ChatMessage, 'content' | 'body' | 'attachments' | 'mentions' | 'reactions'> & { linkedTicketKeys?: string[] }
}

/** What the seed hands over: the document, plus file bytes (base64) keyed by attachment id. */
export type SeedResult = { data: DbData; files: Record<string, { mimeType: string; base64: string }> }

export interface MockDb {
  /** A copy of the data; changing it does not change the stored state. */
  read(): Promise<DbData>
  /** Runs fn on the current data and saves the result, in one transaction. fn must not await. */
  update<T>(fn: (data: DbData) => T): Promise<T>
  getFile(id: string): Promise<Blob | null>
  putFile(id: string, blob: Blob): Promise<void>
  deleteFile(id: string): Promise<void>
  /** Throws every record and file away and seeds again. */
  reset(): Promise<void>
  exportAll(): Promise<ExportBundle & { data: DbData }>
  /** Replaces everything with an export from this or an older version. Throws ApiError 400 and writes nothing if it isn't one. */
  importAll(bundle: unknown): Promise<void>
  /** Acts as this person from now on, in this db (this tab) only; the document's default person stays as it is. */
  actAs(userId: string): void
}

const COLLECTIONS = [
  'users', 'workspaces', 'projects', 'sprints', 'tickets', 'channels', 'messages', 'replies',
  'teams', 'phases', 'deliverables', 'comments', 'attachments', 'projectFiles', 'timeEntries', 'checkIns', 'rates', 'activity', 'drafts', 'trash', 'threadFollows', 'notifications', 'invitations', 'saved', 'scheduled', 'pins', 'folders', 'bookmarks', 'sidebarOrders', 'notificationPrefs', 'roles', 'audit',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Whether a document has the top-level shape the mock backend relies on. */
function hasShape(value: unknown): value is DbData {
  return (
    isRecord(value) &&
    typeof value.version === 'number' &&
    typeof value.currentUserId === 'string' &&
    COLLECTIONS.every((name) => Array.isArray(value[name])) &&
    isRecord(value.counters) &&
    isRecord(value.channelState) &&
    isRecord(value.mentionReads)
  )
}

/**
 * Whether an imported document's records are usable, not just its top-level shape: every record has a string id (a
 * thread follow is keyed by its person and thread instead) and the current user exists, or nobody could sign in as
 * admin to reset it.
 */
function hasUsableRecords(data: DbData): boolean {
  const keyOf = (name: (typeof COLLECTIONS)[number], item: Record<string, unknown>) =>
    name === 'threadFollows'
      ? typeof item.userId === 'string' && typeof item.rootId === 'string'
      : name === 'audit'
        ? typeof item.seq === 'number' && typeof item.hash === 'string' && Array.isArray(item.changes)
        : typeof item.id === 'string'
  const keyed = (name: (typeof COLLECTIONS)[number]) => (data[name] as unknown[]).every((item) => isRecord(item) && keyOf(name, item))
  const strings = (value: unknown) => Array.isArray(value) && value.every((v) => typeof v === 'string')
  return (
    COLLECTIONS.every(keyed) &&
    data.users.some((user) => user.id === data.currentUserId) &&
    // Permissions are worked out from these on every request (slice 1).
    data.users.every((user) => strings(user.roleIds)) &&
    data.roles.every((role) => strings(role.grants))
  )
}

type Condition = 'ok' | 'missing' | 'outdated' | 'newer'

function conditionOf(doc: unknown): Condition {
  if (doc === null) return 'missing'
  if (!hasShape(doc)) return 'outdated'
  if (doc.version === DB_VERSION) return 'ok'
  return doc.version > DB_VERSION ? 'newer' : 'outdated'
}

/** An older document brought up to date, when every step exists and the result is usable; else null (reseed). */
function upgraded(doc: unknown): DbData | null {
  if (!isRecord(doc) || typeof doc.version !== 'number' || doc.version >= DB_VERSION) return null
  let next: Record<string, unknown> | null
  try {
    next = migrate(doc, DB_VERSION)
  } catch {
    // A step choked on a broken document: same as one that doesn't pass the checks below.
    return null
  }
  return next && hasShape(next) && hasUsableRecords(next) ? next : null
}

const toBlob = ({ mimeType, base64 }: { mimeType: string; base64: string }) =>
  new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: mimeType })

const badImport = (newer = false) =>
  new ApiError({
    title: 'Import failed',
    status: 400,
    detail: newer ? 'That export is from a newer version of Spark Flow. Update the app, then import it again.' : "That file isn't a Spark Flow export.",
  })

/**
 * The mock backend's database: one document in the store, plus file bytes. Every write is one transaction, so two
 * tabs writing at the same moment both keep their change. A missing, older or broken document is replaced by the
 * seed inside that same transaction, so two tabs starting together don't seed twice.
 */
export function createDb(store: MockStore, seed: (now: Date) => SeedResult, now: () => Date = () => new Date(), actor: Actor = memoryActor()): MockDb {
  /** The data as this tab's person sees it: currentUserId is the actor when they exist. Mutates `data`. */
  const asActor = (data: DbData) => {
    const who = actor.get()
    if (who && data.users.some((u) => u.id === who)) data.currentUserId = who
    return data
  }

  // Set only when the saved document came from a newer build: then we work from memory and never write it.
  let memory: DbData | null = null
  let warned = false

  const writeFiles = async (files: SeedResult['files']) => {
    for (const [id, file] of Object.entries(files)) await store.putFile(id, toBlob(file))
  }

  const useMemory = (doc: DbData) => {
    memory = structuredClone(doc)
    if (!warned) {
      warned = true
      console.warn('Mock database was saved by a newer version; leaving it untouched and using memory for this session.')
    }
  }

  /**
   * Runs fn on good data in one transaction, seeding first when needed. `save` false leaves the document as it was;
   * `asPerson` false hands fn the document's own default person instead of this tab's.
   */
  const run = async <T>(fn: (data: DbData) => T, save: boolean, asPerson = true): Promise<T> => {
    const view = (data: DbData) => (asPerson ? asActor(data) : data)
    if (memory) {
      const copy = structuredClone(memory)
      const stored = copy.currentUserId
      const result = fn(view(copy))
      copy.currentUserId = stored
      if (save) memory = copy
      return result
    }
    let seededFiles: SeedResult['files'] | null = null
    let newer: DbData | null = null
    let ran = false
    const result = await store.transact((doc) => {
      const condition = conditionOf(doc)
      if (condition === 'newer') {
        newer = doc as DbData
        return { doc, result: undefined as T }
      }
      let data: DbData
      const migrated = condition === 'outdated' ? upgraded(doc) : null
      if (condition === 'ok') {
        data = doc as DbData
      } else if (migrated) {
        data = migrated
      } else {
        const seeded = seed(now())
        data = seeded.data
        seededFiles = seeded.files
      }
      const before = save ? null : structuredClone(data)
      const stored = data.currentUserId
      const value = fn(view(data))
      // The saved document keeps its own default person; who acted is this tab's business.
      data.currentUserId = stored
      ran = true
      return { doc: save ? data : (before ?? data), result: value }
    })
    if (seededFiles) await writeFiles(seededFiles)
    if (!ran && newer) {
      useMemory(newer)
      return run(fn, save, asPerson)
    }
    return result
  }

  return {
    async read() {
      const doc = memory ? null : await store.readDoc()
      if (!memory && conditionOf(doc) === 'ok') return asActor(doc as DbData) // readDoc already hands back a copy
      return run((data) => structuredClone(data), false)
    },
    update(fn) {
      return run(fn, true)
    },
    getFile(id) {
      return store.getFile(id)
    },
    actAs(userId) {
      actor.set(userId)
    },
    putFile(id, blob) {
      return store.putFile(id, blob)
    },
    deleteFile(id) {
      return store.deleteFile(id)
    },
    async reset() {
      memory = null
      await store.clearAll()
      const seeded = seed(now())
      await store.transact(() => ({ doc: seeded.data, result: null }))
      await writeFiles(seeded.files)
    },
    async exportAll() {
      // The file carries the document's default person, not whoever this tab is viewing as.
      const data = await run((d) => structuredClone(d), false, false)
      return { app: 'spark-flow', version: DB_VERSION, exportedAt: now().toISOString(), data }
    },
    async importAll(bundle) {
      if (!isRecord(bundle) || bundle.app !== 'spark-flow' || typeof bundle.version !== 'number') throw badImport()
      if (bundle.version > DB_VERSION) throw badImport(true)
      // An export from an older version goes through the same migrations as an older saved document.
      const data = bundle.version < DB_VERSION ? upgraded(bundle.data) : bundle.data
      if (!hasShape(data) || data.version !== DB_VERSION || !hasUsableRecords(data)) throw badImport()
      // The file is good: everything goes, uploaded file bytes too (an export carries none), then its records come in.
      // An import replaces a newer build's document too (as Reset does), so this tab leaves memory and saves it.
      memory = null
      await store.clearAll()
      await store.transact(() => ({ doc: data, result: null }))
    },
  }
}

/** Removes the Phase 1+2 localStorage database. Missing or blocked storage is left alone. */
export function removeLegacyStorage(storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | undefined): void {
  if (!storage) return
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(LEGACY_PREFIX)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    // blocked storage: nothing we could have saved there either
  }
}
