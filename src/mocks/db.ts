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
  reads: Record<string, string> // channelId -> ISO time the current user last read it
  counters: Record<string, number> // projectId -> next ticket number
}

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface MockDb {
  /** A copy of the data; changing it does not change the stored state. */
  read(): DbData
  /** Runs fn on the current data, saves the result, and hands back what fn returned. */
  update<T>(fn: (data: DbData) => T): T
  /** Throws the saved data away and seeds again. */
  reset(): void
}

/**
 * The mock backend's database, kept as one JSON document in storage. It is parsed on every call so writes
 * from other tabs are seen. If storage can't be read or written (full, or blocked), it carries on from memory.
 */
export function createDb(
  storage: KeyValueStorage,
  seed: (now: Date) => DbData,
  now: () => Date = () => new Date(),
): MockDb {
  let memory: DbData | null = null // only set while storage can't be written
  let unreadable = false // storage threw on read: stay in memory, or the next read would reseed over our writes
  let warned = false

  const warnOnce = (message: string, error: unknown) => {
    if (warned) return
    warned = true
    console.warn(message, error)
  }

  const persist = (data: DbData) => {
    if (unreadable) {
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

  const reseed = (): DbData => {
    const data = seed(now())
    persist(data)
    return structuredClone(data)
  }

  // Always returns a copy the caller may change freely.
  const load = (): DbData => {
    if (memory) return structuredClone(memory)
    let raw: string | null
    try {
      raw = storage.getItem(DB_KEY)
    } catch (error) {
      unreadable = true
      warnOnce('Mock database could not be read; keeping it in memory for this session.', error)
      return reseed()
    }
    if (raw === null) return reseed()
    try {
      const parsed = JSON.parse(raw) as DbData | null
      if (parsed?.version === DB_VERSION) return parsed
    } catch (error) {
      console.warn('Mock database was unreadable; starting again from the demo data.', error)
    }
    return reseed()
  }

  return {
    read: load,
    update(fn) {
      const data = load()
      const result = fn(data)
      persist(data)
      return result
    },
    reset() {
      reseed()
    },
  }
}
