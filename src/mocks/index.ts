import { pagesApi } from './pages'
import { bookmarksApi } from './bookmarks'
import { foldersApi } from './folders'
import { pinsApi } from './pins'
import { threadsApi } from './threads'
import { searchApi } from './search'
import { sidebarApi } from './sidebarOrder'
import { preferencesApi } from './preferences'
import { rolesApi } from './roles'
import { audit } from './audit'
import { auditApi } from './auditApi'
import { archiveApi } from './archive'
import { authApi } from './auth'
import { attendanceApi } from './attendance'
import { ApiError } from '@/lib/apiError'
import type { Api, ChatMessage, NewTicket, ThreadReply, Ticket, TicketPatch } from '@/api/types'
import { addReply, chatApi, sendMessage, type AddReplyInput, type SendMessageInput } from './chat'
import { localSession, sessionActor } from './actor'
import { activityApi } from './activity'
import { createDb, removeLegacyStorage, type MockDb } from './db'
import { dbApi } from './dbApi'
import { filesApi } from './files'
import { mockHub, type MockHub } from './realtime'
import { savedApi } from './saved'
import { scheduledApi } from './scheduled'
import { startScheduler } from './scheduler'
import { seed } from './seed'
import { openStore } from './store'
import { projectsApi } from './projects'
import { sprintsApi } from './sprints'
import { teamsApi } from './teams'
import { commentsApi } from './comments'
import { dashboardApi } from './dashboard'
import { mentionsApi } from './mentions'
import { inboxApi } from './activityFeed'
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
      /** A reminder for me about a message, due in `seconds`; the scheduler fires it on its next pass after that. */
      remindMe(messageId: string, seconds: number): Promise<void>
      /** Moves my running timer's start `hours` back, so the timer timeout can be seen without waiting (timer slice 2). */
      ageTimer(hours: number): Promise<void>
    }
  }
}

/**
 * The Api backed by the mock database. Reads wait like a network call and return copies; writes check the permission
 * table (403) and publish their event on `hub`. `now` drives every derived value, so tests can fix the clock.
 */
export function createMockApi(db: MockDb, hub: MockHub, now: () => Date = () => new Date()): Api {
  const projectParts = projectsApi(db, hub, now)
  return guardRequests(db, {
    workspaces: workspacesApi(db),
    auth: authApi(db),
    users: usersApi(db, hub, now),
    chat: chatApi(db, hub),
    tickets: ticketsApi(db, now),
    ...projectParts,
    sprints: sprintsApi(db, hub, now),
    tasks: tasksApi(db, hub, now),
    teams: teamsApi(db, hub),
    time: timeApi(db, hub, now),
    rates: ratesApi(db, hub, now),
    comments: commentsApi(db, hub, now),
    activity: activityApi(db),
    mentions: mentionsApi(db, hub),
    inbox: inboxApi(db, hub),
    saved: savedApi(db, hub, now),
    scheduled: scheduledApi(db, hub, now),
    pins: pinsApi(db, hub),
    threads: threadsApi(db, hub),
    search: searchApi(db),
    sidebar: sidebarApi(db, hub),
    preferences: preferencesApi(db, hub),
    roles: rolesApi(db, hub),
    folders: foldersApi(db),
    bookmarks: bookmarksApi(db, hub),
    pages: pagesApi(db, hub, now),
    dashboard: dashboardApi(db, now),
    files: filesApi(db, hub, now),
    audit: auditApi(db, now),
    archive: archiveApi(db, hub, now),
    attendance: attendanceApi(db, now),
    db: dbApi(db, hub),
  })
}

/** What anyone may do signed out (slice AB): sign in, sign out, and see the prototype's demo people. */
const OPEN = new Set(['auth.signIn', 'auth.signOut', 'auth.demoPeople'])
/** What a deactivated person's tab may still do (slice 3): list people and switch to someone. */
const OPEN_WHEN_DEACTIVATED = new Set(['users.viewAs', 'users.list', 'workspaces.list'])

/** Signed out, or a deactivated person's session: 401 before the call runs, whatever it reads or writes. */
async function refuseSignedOut(db: MockDb, id: string) {
  if (OPEN.has(id)) return
  if (!db.signedIn()) throw new ApiError({ title: 'Signed out', status: 401, detail: 'Signed out' })
  if (OPEN_WHEN_DEACTIVATED.has(id)) return
  const data = await db.read()
  if (data.users.find((u) => u.id === data.currentUserId)?.deactivated) throw new ApiError({ title: 'Signed out', status: 401, detail: 'This account was deactivated.' })
}

/**
 * What the server does around every call. A deactivated person gets 401 (slice 3), except for switching person.
 * Every call refused for want of a permission (403) goes in the audit log as "denied", in a write of its own (the
 * refused one saved nothing), and the refusal still reaches the caller. The request is named by its route in the Api,
 * `tickets.update`, say.
 */
function guardRequests(db: MockDb, api: Api): Api {
  const wrapped: Record<string, Record<string, unknown>> = {}
  for (const [ns, part] of Object.entries(api) as [string, Record<string, unknown>][]) {
    wrapped[ns] = {}
    for (const [method, value] of Object.entries(part)) {
      if (typeof value !== 'function') {
        wrapped[ns][method] = value
        continue
      }
      const id = `${ns}.${method}`
      wrapped[ns][method] = async (...args: unknown[]) => {
        await refuseSignedOut(db, id)
        try {
          return await value.apply(part, args)
        } catch (error) {
          if (error instanceof ApiError && error.status === 403) {
            await db
              .update((data) => {
                audit(data, { action: 'denied', group: 'access', record: { type: 'request', id, name: id }, result: 'refused', detail: error.detail ?? error.title })
              })
              .catch(() => undefined) // the refusal is what the caller needs; a log that can't be written doesn't replace it
          }
          throw error
        }
      }
    }
  }
  return wrapped as unknown as Api
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
  const session = localSession()
  const ready = () =>
    (opening ??= (async () => {
      removeLegacyStorage(safely(() => window.localStorage))
      return createDb(await openStore(safely(() => globalThis.indexedDB)), seed, undefined, actor, session)
    })())
  return {
    read: () => ready().then((db) => db.read()),
    update: (fn) => ready().then((db) => db.update(fn)),
    getFile: (id) => ready().then((db) => db.getFile(id)),
    putFile: (id, blob) => ready().then((db) => db.putFile(id, blob)),
    deleteFile: (id) => ready().then((db) => db.deleteFile(id)),
    reset: () => ready().then((db) => db.reset()),
    exportAll: () => ready().then((db) => db.exportAll()),
    importAll: (bundle) => ready().then((db) => db.importAll(bundle)),
    actAs: (userId) => actor.set(userId),
    signedIn: () => session.get() !== null,
    signIn: (userId) => {
      session.set(userId)
      actor.set(userId)
    },
    signOut: () => {
      session.set(null)
      actor.clear()
    },
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
        remindMe: (messageId, seconds) =>
          db.update((data) => {
            const message = data.messages.find((m) => m.id === messageId)
            const workspaceId = data.channels.find((c) => c.id === message?.channelId)?.workspaceId
            if (!message || !workspaceId) throw new Error(`No message ${messageId}`)
            const remindAt = new Date(Date.now() + seconds * 1000).toISOString()
            const target = { kind: 'message' as const, id: messageId }
            data.saved = data.saved.filter((s) => !(s.userId === data.currentUserId && s.target.kind === 'message' && s.target.id === messageId))
            data.saved.push({ id: crypto.randomUUID(), userId: data.currentUserId, workspaceId, target, status: 'inProgress', remindAt, firedAt: null, savedAt: new Date().toISOString() })
          }),
        ageTimer: (hours) =>
          db.update((data) => {
            const running = data.timeEntries.find((e) => e.userId === data.currentUserId && e.endedAt === null)
            if (!running) throw new Error('No timer is running.')
            running.startedAt = new Date(Date.parse(running.startedAt) - hours * 3_600_000).toISOString()
          }),
      }
    }
    // The prototype's stand-in for the server's job queue: due reminders and scheduled messages, every 15 seconds.
    startScheduler(db, mockHub)
  }
  return cached.api
}
