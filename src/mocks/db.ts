import type {
  ChatMessage,
  Project,
  Sprint,
  StoredChannel,
  ThreadReply,
  Ticket,
  User,
  Workspace,
} from '@/api/types'

export const DB_KEY = 'spark-flow.mockdb.v1'
export const DB_VERSION = 1
/** One key per channel holds the current user's read time (an ISO time), outside the shared document. */
export const READ_KEY_PREFIX = `${DB_KEY}.read.`

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
  /** channelId -> ISO time the current user last read it. Never in the saved document: it lives in per-channel keys. */
  reads: Record<string, string>
  counters: Record<string, number> // projectId -> next ticket number
}

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'length' | 'key'>>

export interface MockDb {
  /** A copy of the data; changing it does not change the stored state. */
  read(): DbData
  /** Runs fn on the current data, saves the result, and hands back what fn returned. Changes to `reads` are ignored: use markRead. */
  update<T>(fn: (data: DbData) => T): T
  /** Saves the current user's read time for one channel. Writes that one key and never the main document. */
  markRead(channelId: string, at: string): void
  /** Throws the saved data away and seeds again. */
  reset(): void
}

const COLLECTIONS = ['users', 'workspaces', 'projects', 'sprints', 'tickets', 'channels', 'messages', 'replies'] as const

/** Whether a parsed document has the top-level shape the mock backend relies on. */
function hasShape(value: unknown): value is Omit<DbData, 'reads'> {
  if (typeof value !== 'object' || value === null) return false
  const doc = value as Record<string, unknown>
  return (
    typeof doc.currentUserId === 'string' &&
    COLLECTIONS.every((name) => Array.isArray(doc[name])) &&
    typeof doc.counters === 'object' &&
    doc.counters !== null &&
    !Array.isArray(doc.counters)
  )
}

/**
 * The mock backend's database, kept as one JSON document in storage. It is parsed on every call so writes
 * from other tabs are seen. If storage can't be read or written (full, or blocked), it carries on from memory.
 *
 * The current user's read markers are NOT in that document: each channel has its own key. Chromium caches
 * localStorage per renderer, so a fresh tab's mount-time markRead would otherwise write a stale whole document
 * last and erase another tab's message.
 *
 * Whole-document writes are only sequentially consistent across tabs: two tabs writing at the same moment can
 * still lose one write. Phase 3 must serialise writes (an IndexedDB transaction, or one writer tab via navigator.locks).
 */
export function createDb(
  storage: KeyValueStorage,
  seed: (now: Date) => DbData,
  now: () => Date = () => new Date(),
): MockDb {
  let memory: Omit<DbData, 'reads'> | null = null // only set while the document can't be written
  const memoryReads = new Map<string, string>() // read markers that couldn't be written
  let memoryOnly = false // storage threw on read, or holds a newer version: never write it, or we would reseed over / clobber it
  let warned = false

  const warnOnce = (message: string, error?: unknown) => {
    if (warned) return
    warned = true
    console.warn(message, error)
  }

  const writeMarker = (channelId: string, at: string) => {
    if (memoryOnly) {
      memoryReads.set(channelId, at)
      return
    }
    try {
      storage.setItem(READ_KEY_PREFIX + channelId, at)
      memoryReads.delete(channelId)
    } catch (error) {
      memoryReads.set(channelId, at)
      warnOnce('Mock database could not be saved; keeping it in memory for this session.', error)
    }
  }

  const readMarker = (channelId: string): string | undefined => {
    const remembered = memoryReads.get(channelId)
    if (remembered !== undefined) return remembered
    try {
      return storage.getItem(READ_KEY_PREFIX + channelId) ?? undefined
    } catch {
      return undefined
    }
  }

  const clearMarkers = () => {
    memoryReads.clear()
    try {
      const keys: string[] = []
      for (let i = 0; i < (storage.length ?? 0); i++) {
        const key = storage.key?.(i)
        if (key?.startsWith(READ_KEY_PREFIX)) keys.push(key)
      }
      for (const key of keys) storage.removeItem(key)
    } catch {
      // storage is blocked: nothing saved to clear
    }
  }

  const persist = (data: Omit<DbData, 'reads'>) => {
    if (memoryOnly) {
      memory = structuredClone(data)
      return
    }
    try {
      storage.setItem(DB_KEY, JSON.stringify(data))
      memory = null
    } catch (error) {
      // A copy, so a value update's callback handed back can't change what is stored.
      memory = structuredClone(data)
      warnOnce('Mock database could not be saved; keeping it in memory for this session.', error)
    }
  }

  const reseed = (): Omit<DbData, 'reads'> => {
    const { reads, ...doc } = seed(now())
    clearMarkers()
    persist(doc)
    for (const [channelId, at] of Object.entries(reads)) writeMarker(channelId, at)
    return structuredClone(doc)
  }

  // The document only, a copy the caller may change freely.
  const loadDocument = (): Omit<DbData, 'reads'> => {
    if (memory) return structuredClone(memory)
    let raw: string | null
    try {
      raw = storage.getItem(DB_KEY)
    } catch (error) {
      memoryOnly = true
      warnOnce('Mock database could not be read; keeping it in memory for this session.', error)
      return reseed()
    }
    if (raw === null) return reseed()
    try {
      const parsed: unknown = JSON.parse(raw)
      if (hasShape(parsed) && typeof parsed.version === 'number') {
        if (parsed.version === DB_VERSION) return parsed
        if (parsed.version > DB_VERSION) {
          // Saved by a newer build: leave it alone, and work from a copy in memory.
          memoryOnly = true
          memory = structuredClone(parsed)
          warnOnce('Mock database was saved by a newer version; leaving it untouched and using memory for this session.')
          return structuredClone(parsed)
        }
      }
    } catch (error) {
      console.warn('Mock database was unreadable; starting again from the demo data.', error)
    }
    return reseed()
  }

  const load = (): DbData => {
    const doc = loadDocument()
    const reads: Record<string, string> = {}
    for (const channel of doc.channels) {
      const at = readMarker(channel.id)
      if (at !== undefined) reads[channel.id] = at
    }
    return { ...doc, reads }
  }

  return {
    read: load,
    update(fn) {
      const data = load()
      const result = fn(data)
      const { reads: _ignored, ...doc } = data
      persist(doc)
      return result
    },
    markRead(channelId, at) {
      loadDocument() // seeds first if nothing is saved yet, or the seed would overwrite this marker
      writeMarker(channelId, at)
    },
    reset() {
      reseed()
    },
  }
}
