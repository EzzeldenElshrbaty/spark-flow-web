import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, UploadFile } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let db: MockDb
let hub: MockHub
let api: Api
let n = 0

beforeEach(() => {
  latency.min = latency.max = 0
  db = createDb(createMemoryStore(), seed)
  hub = createMockHub(`test-channel-files-${++n}`, null)
  api = createMockApi(db, hub)
})
afterEach(() => hub.close())

const blob = (name: string, type: string, text = 'x'): UploadFile => Object.assign(new Blob([text], { type }), { name })
async function post(channelId: string, ...files: UploadFile[]) {
  const ids = []
  for (const f of files) ids.push((await api.files.uploadForChat(channelId, f)).id)
  return api.chat.send(channelId, '', undefined, undefined, ids)
}
const names = (page: { items: { file: { name: string } }[] }) => page.items.map((i) => i.file.name)

describe('files in a channel (spec 6.1 Files tab)', () => {
  it('lists the files in its messages and thread replies, newest first, with who shared them and where', async () => {
    const m = await post('c-backend', blob('plan.pdf', 'application/pdf', '%PDF-1.4'))
    const pic = await api.files.uploadForChat('c-backend', blob('shot.png', 'image/png'))
    await api.chat.reply(m.id, '', undefined, false, [pic.id])
    const page = await api.files.inChannel('c-backend', {})
    expect(names(page).slice(0, 2)).toEqual(['shot.png', 'plan.pdf'])
    expect(page.items[0]).toMatchObject({ senderId: 'u-1', messageId: m.id, replyId: expect.any(String) })
    expect(page.items[1]).toMatchObject({ messageId: m.id, replyId: null })
  })

  it('filters by type, person and date', async () => {
    await post('c-backend', blob('plan.pdf', 'application/pdf', '%PDF-1.4'), blob('shot.png', 'image/png'), blob('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
    await api.files.uploadForChat('c-backend', blob('q.txt', 'text/plain', 'SELECT 1;'), { snippet: { language: 'sql' } }).then((f) => api.chat.send('c-backend', '', undefined, undefined, [f.id]))
    expect(names(await api.files.inChannel('c-backend', { type: 'image' }))).toContain('shot.png')
    expect(names(await api.files.inChannel('c-backend', { type: 'image' }))).not.toContain('plan.pdf')
    expect(names(await api.files.inChannel('c-backend', { type: 'pdf' }))).toContain('plan.pdf')
    expect(names(await api.files.inChannel('c-backend', { type: 'document' }))).toContain('notes.docx')
    expect(names(await api.files.inChannel('c-backend', { type: 'snippet' }))).toEqual(['q.txt'])
    expect(names(await api.files.inChannel('c-backend', { from: 'u-2' }))).not.toContain('plan.pdf')
    expect(names(await api.files.inChannel('c-backend', { since: new Date(Date.now() + 60_000).toISOString() }))).toEqual([])
  })

  it('pages 50 at a time', async () => {
    const many = Array.from({ length: 55 }, (_, i) => blob(`f${i}.png`, 'image/png'))
    for (let i = 0; i < many.length; i += 10) await post('c-backend', ...many.slice(i, i + 10))
    const first = await api.files.inChannel('c-backend', {})
    expect(first.items).toHaveLength(50)
    expect(first.nextCursor).not.toBeNull()
    const next = await api.files.inChannel('c-backend', { cursor: first.nextCursor! })
    expect(next.items.length).toBeGreaterThanOrEqual(5)
    expect(new Set([...names(first), ...names(next)]).size).toBe(first.items.length + next.items.length)
  })

  it('leaves out deleted files and refuses a private channel I’m not in', async () => {
    const m = await post('c-backend', blob('gone.pdf', 'application/pdf', '%PDF-1.4'))
    await api.files.delete(m.attachments[0].id)
    expect(names(await api.files.inChannel('c-backend', {}))).not.toContain('gone.pdf')
    await api.users.viewAs('u-3')
    await expect(api.files.inChannel('c-release', {})).rejects.toMatchObject({ status: 403 })
  })
})
