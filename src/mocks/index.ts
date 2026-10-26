import type { Api, ChatMessage, NewTicket, ThreadReply, Ticket, TicketPatch } from '@/api/types'
import { addReply, chatApi, sendMessage, type AddReplyInput, type SendMessageInput } from './chat'
import { createDb, type KeyValueStorage, type MockDb } from './db'
import { devApi } from './dev'
import { createMemoryStorage } from './memoryStore'
import { mockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createTicket, ticketsApi, updateTicket } from './tickets'
import { usersApi } from './users'
import { workspacesApi } from './workspaces'

export { addReply, createTicket, sendMessage, updateTicket }

declare global {
  interface Window {
    /** Dev builds only: the mock backend's write helpers, for manual and Playwright checks. */
    __sparkFlowDev?: {
      sendMessage(input: SendMessageInput): Promise<ChatMessage>
      addReply(input: AddReplyInput): Promise<ThreadReply>
      createTicket(input: NewTicket): Promise<Ticket>
      updateTicket(key: string, patch: TicketPatch): Promise<Ticket>
    }
  }
}

/**
 * The Api backed by the mock database. Reads wait like a network call and return copies. Writes are the
 * helpers above; they come to Api in Phases 3–4, and will publish on `_hub`.
 */
export function createMockApi(db: MockDb, _hub: MockHub): Api {
  return {
    workspaces: workspacesApi(db),
    users: usersApi(db),
    chat: chatApi(db),
    tickets: ticketsApi(db),
    dev: devApi(db),
  }
}

/** window.localStorage, or memory when the browser blocks it (reading the property can throw). */
function pickStorage(): KeyValueStorage {
  try {
    const storage = window.localStorage
    if (storage) return storage
  } catch {
    // blocked: fall through
  }
  console.warn('localStorage is not available; the mock database will only last for this session.')
  return createMemoryStorage()
}

let cached: { db: MockDb; api: Api } | null = null

/** The app's mock Api, created on first use. */
export function getMockApi(): Api {
  if (!cached) {
    const db = createDb(pickStorage(), seed)
    cached = { db, api: createMockApi(db, mockHub) }
    if (import.meta.env.DEV) {
      window.__sparkFlowDev = {
        sendMessage: (input) => sendMessage(db, mockHub, input),
        addReply: (input) => addReply(db, mockHub, input),
        createTicket: (input) => createTicket(db, mockHub, input),
        updateTicket: (key, patch) => updateTicket(db, mockHub, key, patch),
      }
    }
  }
  return cached.api
}
