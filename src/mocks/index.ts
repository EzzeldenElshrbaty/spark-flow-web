import type { Api, ChatMessage, NewTicket, ThreadReply, Ticket, TicketPatch } from '@/api/types'
import { addReply, chatApi, sendMessage, type AddReplyInput, type SendMessageInput } from './chat'
import { sessionActor } from './actor'
import { createDb, removeLegacyStorage, type MockDb } from './db'
import { dbApi } from './dbApi'
import { filesApi } from './files'
import { mockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { openStore } from './store'
import { projectsApi } from './projects'
import { teamsApi } from './teams'
import { commentsApi } from './comments'
import { dashboardApi } from './dashboard'
import { mentionsApi } from './mentions'
import { ratesApi } from './rates'
import { timeApi } from './time'
import { createTicket, tasksApi, ticketsApi, updateTicket } from './tickets'
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
 * The Api backed by the mock database. Reads wait like a network call and return copies; writes check the permission
 * table (403) and publish their event on `hub`. `now` drives every derived value, so tests can fix the clock.
 */
export function createMockApi(db: MockDb, hub: MockHub, now: () => Date = () => new Date()): Api {
  const { summaries, ...projectParts } = projectsApi(db, hub, now)
  return {
    workspaces: workspacesApi(db),
    users: usersApi(db),
    chat: chatApi(db, hub),
    tickets: ticketsApi(db, now, summaries),
    ...projectParts,
    tasks: tasksApi(db, hub, now),
    teams: teamsApi(db),
    time: timeApi(db, hub, now),
    rates: ratesApi(db),
    comments: commentsApi(db, hub, now),
    mentions: mentionsApi(db),
    dashboard: dashboardApi(db, now),
    files: filesApi(db, now),
    db: dbApi(db),
  }
}

/** Reading these browser properties can throw when storage is blocked; then they count as missing. */
function safely<T>(read: () => T): T | undefined {
  try {
    return read()
  } catch {
    return undefined
  }
}

/**
 * A MockDb whose store opens on first use: IndexedDB in the browser, memory when it's blocked. Opening also removes
 * the Phase 1+2 localStorage database.
 */
function lazyDb(): MockDb {
  let opening: Promise<MockDb> | null = null
  const actor = sessionActor()
  const ready = () =>
    (opening ??= (async () => {
      removeLegacyStorage(safely(() => window.localStorage))
      return createDb(await openStore(safely(() => globalThis.indexedDB)), seed, undefined, actor)
    })())
  return {
    read: () => ready().then((db) => db.read()),
    update: (fn) => ready().then((db) => db.update(fn)),
    getFile: (id) => ready().then((db) => db.getFile(id)),
    putFile: (id, blob) => ready().then((db) => db.putFile(id, blob)),
    reset: () => ready().then((db) => db.reset()),
    exportAll: () => ready().then((db) => db.exportAll()),
    importAll: (bundle) => ready().then((db) => db.importAll(bundle)),
    actAs: (userId) => actor.set(userId),
  }
}

let cached: { db: MockDb; api: Api } | null = null

/** The app's mock Api, created on first use. */
export function getMockApi(): Api {
  if (!cached) {
    const db = lazyDb()
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
