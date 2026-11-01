import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { DEMO_PASSWORD } from '@/lib/demo'
import { memoryActor } from './actor'
import { setRequestInfo } from './audit'
import { createDb, memorySession, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

// Signing in (slice AB): a session, the demo people to sign in as, and 401 for everything else while signed out.

let db: MockDb
let api: Api
let hub: MockHub
beforeEach(() => {
  latency.min = latency.max = 0
  setRequestInfo(() => ({ ip: '10.1.2.3', device: 'Chrome 130 · macOS' }))
  hub = createMockHub(`test-auth-${Math.random()}`, null)
  // Signed out, as a first visit to the prototype is.
  db = createDb(createMemoryStore(), seed, () => new Date('2026-11-01T10:00:00Z'), memoryActor(), memorySession(null))
  api = createMockApi(db, hub, () => new Date('2026-11-01T10:00:00Z'))
})
afterEach(() => hub.close())

const status = (promise: Promise<unknown>) => promise.then(() => 200, (e: { status?: number }) => e.status)
const detail = (promise: Promise<unknown>) => promise.then(() => '', (e: { detail?: string }) => e.detail)

describe('signing in (slice AB)', () => {
  it('signed out, every call is a 401 except signing in and the demo list', async () => {
    expect(await status(api.users.me())).toBe(401)
    expect(await status(api.workspaces.list())).toBe(401)
    expect(await status(api.users.viewAs('u-2'))).toBe(401)
    expect(await status(api.auth.demoPeople())).toBe(200)
  })

  it('the demo list: active people, Admins first, then by role and name, with their roles and title', async () => {
    const people = await api.auth.demoPeople()
    expect(people[0]).toEqual({ id: 'u-1', name: 'Youssef Abdelrahman', email: 'youssef.abdelrahman@spark-sys.com', title: 'Managing Director', roles: ['Admin'] })
    const order = ['Admin', 'Project manager', 'Sales', 'Member']
    const ranks = people.map((p) => order.indexOf(p.roles[0]!))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(people).toHaveLength(9)
  })

  it('the right email and password sign in, any case or spaces in the email; the log records it', async () => {
    const me = await api.auth.signIn('  Nour.ElSayed@Spark-Sys.com ', DEMO_PASSWORD)
    expect(me).toMatchObject({ id: 'u-2', name: 'Nour El-Sayed' })
    expect((await api.users.me()).id).toBe('u-2')
    expect((await db.read()).audit.at(-1)).toMatchObject({ action: 'signedIn', group: 'access', actorId: 'u-2', detail: 'Password', ip: '10.1.2.3' })
  })

  it('a wrong password, an unknown email or a deactivated person is refused; the log records the attempt', async () => {
    expect(await detail(api.auth.signIn('nour.elsayed@spark-sys.com', 'nope'))).toBe("That email and password don't match.")
    expect(await detail(api.auth.signIn('nobody@spark-sys.com', DEMO_PASSWORD))).toBe("That email and password don't match.")
    expect((await db.read()).audit.at(-1)).toMatchObject({ action: 'signInFailed', actorId: null, actorName: 'nobody@spark-sys.com', result: 'failed', detail: 'Wrong email or password' })
    await api.auth.signIn('youssef.abdelrahman@spark-sys.com', DEMO_PASSWORD)
    await api.users.deactivate('u-6', 'Left')
    await api.auth.signOut()
    expect(await detail(api.auth.signIn('hossam.gaber@spark-sys.com', DEMO_PASSWORD))).toBe('This account is deactivated. Ask an Admin to reactivate it.')
    expect((await api.auth.demoPeople()).some((p) => p.id === 'u-6')).toBe(false)
  })

  it('signing out ends the session: the next call is a 401, and the log records it', async () => {
    await api.auth.signIn('mariam.fathy@spark-sys.com', DEMO_PASSWORD)
    await api.auth.signOut()
    expect(await status(api.users.me())).toBe(401)
    expect((await db.read()).audit.at(-1)).toMatchObject({ action: 'signedOut', actorId: 'u-3' })
  })
})
