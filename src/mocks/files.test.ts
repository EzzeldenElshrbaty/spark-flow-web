import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, UploadFile } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let api: Api
let hub: MockHub

beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-files-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())

const file = (name: string, content: BlobPart[] | Blob, type = 'application/pdf'): UploadFile =>
  Object.assign(content instanceof Blob ? content : new Blob(content, { type }), { name })

describe('files', () => {
  it('upload stores bytes and details; list shows it first; url opens it', async () => {
    const stored = await api.files.upload('p-mob', file('handover.pdf', ['%PDF-1.4 hello']))
    expect(stored.attachment).toMatchObject({ name: 'handover.pdf', mimeType: 'application/pdf', size: 14 })
    expect((await api.files.list('p-mob'))[0].id).toBe(stored.id)
    expect(await (await db.getFile(stored.attachmentId))?.text()).toBe('%PDF-1.4 hello')
    expect((await api.files.url(stored.attachmentId)).startsWith('blob:')).toBe(true)
  })

  it('lists the seeded files of a project', async () => {
    expect((await api.files.list('p-mob')).map((f) => f.attachment.name).sort()).toEqual(['mobile-2.4.0-scope.pdf', 'release-2.4.0-checklist.txt'])
  })

  it('upload rejects empty, oversize and disallowed types, and stores nothing', async () => {
    const before = await db.read()
    await expect(api.files.upload('p-mob', file('empty.pdf', []))).rejects.toMatchObject({ status: 400, detail: 'That file is empty.' })
    // A stand-in with a 26 MB size: the check runs before any bytes are read.
    const big = { name: 'big.pdf', type: 'application/pdf', size: 26 * 1024 * 1024 } as unknown as UploadFile
    await expect(api.files.upload('p-mob', big)).rejects.toMatchObject({ status: 400, detail: 'Files can be up to 25 MB.' })
    await expect(api.files.upload('p-mob', file('run.exe', ['MZ'], 'application/octet-stream'))).rejects.toMatchObject({ status: 400, detail: "That type of file can't be added." })
    expect((await db.read()).attachments).toEqual(before.attachments)
  })

  it('only people on the project can upload', async () => {
    await api.users.viewAs('u-3') // Mariam, not on MOB
    await expect(api.files.upload('p-mob', file('x.pdf', ['%PDF-']))).rejects.toMatchObject({ status: 403 })
  })
})

describe('files reach other tabs', () => {
  it('an upload publishes filesChanged for its project', async () => {
    const events: unknown[] = []
    hub.subscribe((e) => events.push(e))
    await api.files.upload('p-mob', file('handover.pdf', ['%PDF-1.4 hello']))
    expect(events).toContainEqual({ type: 'filesChanged', projectId: 'p-mob' })
  })
})

describe('no bytes left behind', () => {
  it('a project upload refused in the write leaves no bytes behind', async () => {
    await api.users.viewAs('u-8') // Tarek, a member of Mobile App
    const stale = await db.read()
    await api.users.viewAs('u-4')
    await api.projects.update('p-mob', { memberIds: ['u-4', 'u-5', 'u-6'] }) // Tarek off as a member…
    await api.projects.update('p-mob', { teamIds: [] }) // …and through the Mobile team
    await api.users.viewAs('u-8')
    const ids: string[] = []
    const spy: MockDb = { ...db, read: async () => structuredClone(stale), putFile: (id, b) => (ids.push(id), db.putFile(id, b)) }
    await expect(createMockApi(spy, hub).files.upload('p-mob', file('a.pdf', ['%PDF-1.4 x']))).rejects.toMatchObject({ status: 403 })
    expect(ids).toHaveLength(1)
    expect(await db.getFile(ids[0]!)).toBeNull()
  })
})

describe('removing project files', () => {
  const add = async (as: string) => {
    await api.users.viewAs(as)
    return api.files.upload('p-mob', file('notes.pdf', ['%PDF-1.4 notes']))
  }
  it('the uploader removes a file; it leaves the list, its bytes and the history says so', async () => {
    const stored = await add('u-8') // Tarek, a Mobile member
    await api.files.removeFromProject('p-mob', stored.attachment.id)
    expect((await api.files.list('p-mob')).some((f) => f.id === stored.id)).toBe(false)
    expect(await db.getFile(stored.attachment.id)).toBeNull()
    expect((await db.read()).activity.at(-1)).toMatchObject({ kind: 'file.removed', subject: 'notes.pdf', projectId: 'p-mob' })
  })
  it("the manager can remove anyone's file; another member gets 403", async () => {
    const stored = await add('u-8')
    await api.users.viewAs('u-5') // Salma, also on Mobile
    await expect(api.files.removeFromProject('p-mob', stored.attachment.id)).rejects.toMatchObject({ status: 403, detail: 'You can only remove files you added.' })
    await api.users.viewAs('u-4') // Ahmed manages Mobile
    await api.files.removeFromProject('p-mob', stored.attachment.id)
    expect((await api.files.list('p-mob')).some((f) => f.id === stored.id)).toBe(false)
  })
  it('an upload cancelled before the write saves nothing', async () => {
    const before = await api.files.list('p-mob')
    const ids: string[] = []
    const spy: MockDb = { ...db, putFile: (id, b) => (ids.push(id), db.putFile(id, b)) }
    const c = new AbortController()
    c.abort()
    await expect(createMockApi(spy, hub).files.upload('p-mob', file('late.pdf', ['%PDF-1.4 late']), c.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(await api.files.list('p-mob')).toEqual(before)
    for (const id of ids) expect(await db.getFile(id)).toBeNull()
  })
})

describe('file addresses', () => {
  it("a file's address is refused to someone off its project, and served to someone on it", async () => {
    const stored = await api.files.upload('p-nex', file('spec.pdf', ['%PDF-1.4 spec']))
    await api.users.viewAs('u-8') // Tarek: not on Nexus Core
    await expect(api.files.url(stored.attachmentId)).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-3') // Mariam: on it
    expect((await api.files.url(stored.attachmentId)).startsWith('blob:')).toBe(true)
  })
})

