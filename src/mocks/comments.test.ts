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
let api: Api
let hub: MockHub

beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-comments-${Math.random()}`, null)
  db = createDb(createMemoryStore(), seed)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())

const file = (name: string, parts: BlobPart[], type: string): UploadFile => Object.assign(new Blob(parts, { type }), { name })
const png = () => file('shot.png', ['\x89PNG fake'], 'image/png')
const counts = async () => {
  const d = await db.read()
  return { comments: d.comments.length, attachments: d.attachments.length, messages: d.messages.length }
}

describe('comments', () => {
  it('create stores the comment, its files and a card in the project chat', async () => {
    await api.users.viewAs('u-5') // Salma, on Nexus Core
    const made = await api.comments.create({ taskKey: 'NEX-105', kind: 'bug', body: '  Still broken for @[Mariam](u-3) ', files: [png()] })
    expect(made).toMatchObject({ kind: 'bug', body: 'Still broken for @[Mariam](u-3)', authorId: 'u-5', projectId: 'p-nex' })
    expect(made.attachments).toHaveLength(1)
    expect(await (await db.getFile(made.attachments[0].id))?.text()).toBe('\x89PNG fake')
    const list = await api.comments.list('NEX-105')
    expect(list.at(-1)?.id).toBe(made.id)
    expect(list[0].createdAt <= list.at(-1)!.createdAt).toBe(true) // oldest first
    const card = (await db.read()).messages.find((m) => m.commentId === made.id)!
    expect(card).toMatchObject({ channelId: 'c-p-nex', senderId: 'u-5', mentions: [{ kind: 'user', id: 'u-3' }], linkedTicketKeys: ['NEX-105'] })
    expect(card.content.startsWith('Bug on NEX-105: ')).toBe(true)
    expect(card.attachments.map((a) => a.id)).toEqual([made.attachments[0].id])
  })

  it("refuses a member who isn't on the project, and an empty body", async () => {
    await expect(api.comments.create({ taskKey: 'NEX-101', kind: 'comment', body: '  ', files: [] })).rejects.toMatchObject({ status: 400, detail: 'Write a comment first.' })
    await api.users.viewAs('u-8') // Tarek, not on Nexus Core
    await expect(api.comments.create({ taskKey: 'NEX-101', kind: 'comment', body: 'Hi', files: [] })).rejects.toMatchObject({ status: 403 })
  })

  it('rejects bad files and stores nothing', async () => {
    const before = await counts()
    const exe = file('setup.exe', ['MZ'], 'application/octet-stream')
    await expect(api.comments.create({ taskKey: 'NEX-101', kind: 'comment', body: 'x', files: [file('empty.png', [], 'image/png')] })).rejects.toMatchObject({ detail: 'That file is empty.' })
    await expect(api.comments.create({ taskKey: 'NEX-101', kind: 'comment', body: 'x', files: [exe] })).rejects.toMatchObject({ detail: "That type of file can't be added." })
    await expect(api.comments.create({ taskKey: 'NEX-101', kind: 'comment', body: 'x', files: Array.from({ length: 6 }, png) })).rejects.toMatchObject({ detail: 'Add up to 5 files at a time.' })
    expect(await counts()).toEqual(before)
  })

  it('takes videos (spec §5: bugs with video)', async () => {
    const made = await api.comments.create({ taskKey: 'NEX-105', kind: 'bug', body: 'Screen recording', files: [file('screen.mp4', ['ftypmp42'], 'video/mp4'), file('clip.webm', ['webm'], 'video/webm'), file('take.mov', ['moov'], 'video/quicktime')] })
    expect(made.attachments.map((a) => a.mimeType)).toEqual(['video/mp4', 'video/webm', 'video/quicktime'])
  })

  it('a bug with only a file is fine; neither text nor file is refused', async () => {
    const made = await api.comments.create({ taskKey: 'NEX-105', kind: 'bug', body: '  ', files: [png()] })
    expect(made.body).toBe('')
    const card = (await db.read()).messages.find((m) => m.commentId === made.id)!
    expect(card.content).toBe('Bug on NEX-105')
    await expect(api.comments.create({ taskKey: 'NEX-105', kind: 'bug', body: ' ', files: [] })).rejects.toMatchObject({ detail: 'Write a comment first.' })
  })

  it('publishes messageReceived then commentAdded', async () => {
    const events: RealtimeEvent[] = []
    hub.subscribe((e) => events.push(e))
    await api.comments.create({ taskKey: 'NEX-101', kind: 'comment', body: 'Looks good', files: [] })
    expect(events.map((e) => e.type)).toEqual(['messageReceived', 'commentAdded'])
    expect(events[1]).toMatchObject({ type: 'commentAdded', taskKey: 'NEX-101', projectId: 'p-nex' })
  })

  it('list returns seeded comments with their attachments', async () => {
    const list = await api.comments.list('NEX-105')
    expect(list.find((c) => c.id === 'cm-002')?.attachments.map((a) => a.id)).toEqual(['a-shot-105'])
  })
})
