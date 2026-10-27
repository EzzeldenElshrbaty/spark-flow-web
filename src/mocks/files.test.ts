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
