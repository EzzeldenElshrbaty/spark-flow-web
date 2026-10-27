import type {
  ActivityEntry,
  Attachment,
  ChatMessage,
  CheckIn,
  Comment,
  Deliverable,
  ExportBundle,
  Phase,
  Project,
  ProjectFile,
  Rate,
  Sprint,
  StoredChannel,
  Team,
  ThreadReply,
  Ticket,
  TimeEntry,
  User,
  Workspace,
} from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { memoryActor, type Actor } from './actor'
import { migrate } from './migrations'
import type { MockStore } from './store'

export const DB_VERSION = 5 // 2: the company-system document (spec §3); 3: mention read state; 4: channel reads per person; 5: typed columns, history
/** Phase 1+2 kept the mock database in localStorage under keys starting with this. */
const LEGACY_PREFIX = 'spark-flow.mockdb.v1'

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
  /** userId -> channelId -> ISO time they last read it. */
  reads: Record<string, Record<string, string>>
  /** userId -> ids of the mentions they have read. */
  mentionReads: Record<string, string[]>
  counters: Record<string, number> // projectId -> next ticket number
  /** Every project's history, oldest first. */
  activity: ActivityEntry[]
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
  /** Throws every record and file away and seeds again. */
  reset(): Promise<void>
  exportAll(): Promise<ExportBundle & { data: DbData }>
  /** Replaces everything with an export from this version. Throws ApiError 400 and writes nothing if it isn't one. */
  importAll(bundle: unknown): Promise<void>
  /** Acts as this person from now on, in this db (this tab) only; the document's default person stays as it is. */
  actAs(userId: string): void
}

const COLLECTIONS = [
  'users', 'workspaces', 'projects', 'sprints', 'tickets', 'channels', 'messages', 'replies',
  'teams', 'phases', 'deliverables', 'comments', 'attachments', 'projectFiles', 'timeEntries', 'checkIns', 'rates', 'activity',
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
    isRecord(value.reads) &&
    isRecord(value.mentionReads)
  )
}

/**
 * Whether an imported document's records are usable, not just its top-level shape: every record has a string id
 * (rates are keyed by userId), and the current user exists, or nobody could sign in as admin to reset it.
 */
function hasUsableRecords(data: DbData): boolean {
  const keyed = (list: unknown[], key: 'id' | 'userId') => list.every((item) => isRecord(item) && typeof item[key] === 'string')
  return (
    COLLECTIONS.every((name) => keyed(data[name], name === 'rates' ? 'userId' : 'id')) &&
    data.users.some((user) => user.id === data.currentUserId)
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
  const next = migrate(doc, DB_VERSION)
  return next && hasShape(next) && hasUsableRecords(next) ? next : null
}

const toBlob = ({ mimeType, base64 }: { mimeType: string; base64: string }) =>
  new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: mimeType })

const badImport = () =>
  new ApiError({ title: 'Import failed', status: 400, detail: "That file isn't a Spark Flow export from this version." })

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

  /** Runs fn on good data in one transaction, seeding first when needed. `save` false leaves the document as it was. */
  const run = async <T>(fn: (data: DbData) => T, save: boolean): Promise<T> => {
    if (memory) {
      const copy = structuredClone(memory)
      const stored = copy.currentUserId
      const result = fn(asActor(copy))
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
      const value = fn(asActor(data))
      // The saved document keeps its own default person; who acted is this tab's business.
      data.currentUserId = stored
      ran = true
      return { doc: save ? data : (before ?? data), result: value }
    })
    if (seededFiles) await writeFiles(seededFiles)
    if (!ran && newer) {
      useMemory(newer)
      return run(fn, save)
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
    async reset() {
      memory = null
      await store.clearAll()
      const seeded = seed(now())
      await store.transact(() => ({ doc: seeded.data, result: null }))
      await writeFiles(seeded.files)
    },
    async exportAll() {
      const data = await this.read()
      return { app: 'spark-flow', version: DB_VERSION, exportedAt: now().toISOString(), data }
    },
    async importAll(bundle) {
      if (!isRecord(bundle) || bundle.app !== 'spark-flow' || bundle.version !== DB_VERSION) throw badImport()
      const data = bundle.data
      if (!hasShape(data) || data.version !== DB_VERSION || !hasUsableRecords(data)) throw badImport()
      if (memory) {
        memory = structuredClone(data)
        return
      }
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
