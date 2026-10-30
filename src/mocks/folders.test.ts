import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, UploadFile } from '@/api/types'
import type { RealtimeEvent } from '@/lib/realtime'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let hub: MockHub
let api: Api
let events: RealtimeEvent[]
let n = 0

beforeEach(() => {
  latency.min = latency.max = 0
  db = createDb(createMemoryStore(), seed)
  hub = createMockHub(`test-folders-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const pdf = (name: string): UploadFile => Object.assign(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), { name })
async function shared(name = 'scope.pdf') {
  const file = await api.files.uploadForChat('c-backend', pdf(name))
  await api.chat.send('c-backend', '', undefined, undefined, [file.id])
  return file
}

describe('folders (spec 6.9 Add to folder, §7 File folder_id): one per file, shared by the workspace', () => {
  it('makes a folder, lists them by name, and refuses a blank or repeated name', async () => {
    const releases = await api.folders.create('ws-eng', '  Releases ')
    expect(releases).toMatchObject({ name: 'Releases', workspaceId: 'ws-eng', createdBy: 'u-1' })
    await api.folders.create('ws-eng', 'Designs')
    expect((await api.folders.list('ws-eng')).map((f) => f.name)).toEqual(['Designs', 'Releases'])
    await expect(api.folders.create('ws-eng', ' ')).rejects.toMatchObject({ status: 400, detail: 'Name the folder.' })
    await expect(api.folders.create('ws-eng', 'releases')).rejects.toMatchObject({ status: 400, detail: 'There’s a folder called Releases already.' })
  })

  it('puts a file in a folder and takes it out; the Files tab filters by it', async () => {
    const folder = await api.folders.create('ws-eng', 'Releases')
    const file = await shared()
    await shared('other.pdf')
    expect((await api.files.update(file.id, { folderId: folder.id })).folderId).toBe(folder.id)
    expect(events).toContainEqual({ type: 'fileChanged', fileId: file.id })
    expect((await api.files.inChannel('c-backend', { folderId: folder.id })).items.map((i) => i.file.name)).toEqual(['scope.pdf'])
    expect((await api.files.update(file.id, { folderId: null })).folderId).toBeNull()
  })

  it('only whoever may edit the file’s details files it, into a folder of its workspace', async () => {
    const folder = await api.folders.create('ws-eng', 'Releases')
    const file = await shared()
    await expect(api.files.update(file.id, { folderId: 'fold-nope' })).rejects.toMatchObject({ status: 400, detail: 'That folder doesn’t exist.' })
    await api.users.viewAs('u-2')
    await expect(api.files.update(file.id, { folderId: folder.id })).rejects.toMatchObject({ status: 403 })
  })
})
