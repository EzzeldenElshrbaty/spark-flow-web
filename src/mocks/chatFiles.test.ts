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
  hub = createMockHub(`test-chat-files-${++n}`, null)
  api = createMockApi(db, hub)
  events = []
  hub.subscribe((e) => events.push(e))
})
afterEach(() => hub.close())

const file = (name: string, text = '%PDF-1.4 hello', type = 'application/pdf'): UploadFile => Object.assign(new Blob([text], { type }), { name })
const upload = (name = 'scope.pdf', channelId = 'c-backend') => api.files.uploadForChat(channelId, file(name))

describe('uploading a file for a message (spec §8: upload-url, the bytes, complete)', () => {
  it('reports progress up to the whole file and gives back the file, mine, named after itself, checked clean', async () => {
    const progress: number[] = []
    const uploaded = await api.files.uploadForChat('c-backend', file('scope.pdf'), { onProgress: (p) => progress.push(p) })
    expect(progress.length).toBeGreaterThan(1)
    expect(progress.at(-1)).toBe(1)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
    expect(uploaded).toMatchObject({ name: 'scope.pdf', title: 'scope.pdf', description: '', mimeType: 'application/pdf', size: 14, uploadedBy: 'u-1', scanStatus: 'clean', deletedAt: null })
    expect(await (await db.getFile(uploaded.id))?.text()).toBe('%PDF-1.4 hello')
  })

  it('refuses what the files rules refuse, a channel I can’t post in, and a cancelled upload, keeping nothing', async () => {
    const before = (await db.read()).attachments.length
    await expect(api.files.uploadForChat('c-backend', file('empty.pdf', ''))).rejects.toMatchObject({ status: 400, detail: 'That file is empty.' })
    await expect(upload('run.exe')).rejects.toMatchObject({ status: 400, detail: "That type of file can't be added." })
    await api.users.viewAs('u-3')
    await expect(upload('scope.pdf', 'c-release')).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-1')
    const stop = new AbortController()
    stop.abort()
    await expect(api.files.uploadForChat('c-backend', file('scope.pdf'), { signal: stop.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect((await db.read()).attachments.length).toBe(before)
  })
})

describe('sending files (spec 6.9: several files go as one message with the text)', () => {
  it('a message carries its files, with text or without; a retry gets the same message', async () => {
    const [a, b] = [await upload('a.pdf'), await upload('b.png')]
    const sent = await api.chat.send('c-backend', 'Two files', 'k-1', undefined, [a.id, b.id])
    expect(sent.attachments.map((f) => f.name)).toEqual(['a.pdf', 'b.png'])
    expect((await api.chat.send('c-backend', 'Two files', 'k-1', undefined, [a.id, b.id])).id).toBe(sent.id)
    const alone = await api.chat.send('c-backend', '', undefined, undefined, [(await upload('c.pdf')).id])
    expect(alone.content).toBe('')
    expect(alone.attachments).toHaveLength(1)
    await expect(api.chat.send('c-backend', '')).rejects.toMatchObject({ status: 400, detail: 'Write a message first.' })
  })

  it('takes up to 10 files, only mine, and only files that exist', async () => {
    const many = await Promise.all(Array.from({ length: 11 }, (_, i) => upload(`f${i}.pdf`)))
    await expect(api.chat.send('c-backend', 'Lots', undefined, undefined, many.map((f) => f.id))).rejects.toMatchObject({ status: 400, detail: 'Attach up to 10 files to a message.' })
    await expect(api.chat.send('c-backend', 'Gone', undefined, undefined, ['a-none'])).rejects.toMatchObject({ status: 404 })
    await api.users.viewAs('u-2')
    await expect(api.chat.send('c-backend', 'Not mine', undefined, undefined, [many[0].id])).rejects.toMatchObject({ status: 403, detail: 'You can only send files you uploaded.' })
  })

  it('a thread reply carries files too, and so does its copy in the channel', async () => {
    const root = await api.chat.send('c-backend', 'Root')
    const f = await upload('log.txt')
    const reply = await api.chat.reply(root.id, 'Here', undefined, true, [f.id])
    expect(reply.attachments.map((x) => x.name)).toEqual(['log.txt'])
    const copy = (await api.chat.messages('c-backend')).items.find((m) => m.id === reply.id)
    expect(copy?.attachments.map((x) => x.name)).toEqual(['log.txt'])
  })
})

describe('who can open a file, and its details (spec 6.9 File details, §9)', () => {
  it('whoever reads a channel it is in opens it; someone who can’t read that channel can’t', async () => {
    const f = await upload('secret.pdf', 'c-release')
    await api.chat.send('c-release', 'Scope', undefined, undefined, [f.id])
    expect((await api.files.url(f.id)).startsWith('blob:')).toBe(true)
    await api.users.viewAs('u-3')
    await expect(api.files.url(f.id)).rejects.toMatchObject({ status: 404 })
    await expect(api.files.details(f.id)).rejects.toMatchObject({ status: 404 })
  })

  it('details say who uploaded it and where it is shared, as I may see it', async () => {
    const f = await upload('scope.pdf')
    const sent = await api.chat.send('c-backend', 'Scope', undefined, undefined, [f.id])
    const details = await api.files.details(f.id)
    expect(details.file).toMatchObject({ id: f.id, uploadedBy: 'u-1' })
    expect(details.sharedIn).toEqual([{ channelId: 'c-backend', messageId: sent.id, replyId: null, at: sent.createdAt }])
  })
})

describe('editing and deleting a file (spec 6.9 file menu, §9: uploader or admin)', () => {
  it('the uploader renames and describes it, and every message that shows it says so, live', async () => {
    const f = await upload('scope.pdf')
    const sent = await api.chat.send('c-backend', 'Scope', undefined, undefined, [f.id])
    events = []
    const edited = await api.files.update(f.id, { title: '  Release scope  ', description: ' What ships in 2.4. ' })
    expect(edited).toMatchObject({ title: 'Release scope', description: 'What ships in 2.4.', name: 'scope.pdf' })
    expect((await api.chat.message(sent.id)).attachments[0]).toMatchObject({ title: 'Release scope', description: 'What ships in 2.4.' })
    expect(events).toContainEqual({ type: 'fileChanged', fileId: f.id })
    expect(events).toContainEqual({ type: 'messageChanged', channelId: 'c-backend', messageId: sent.id })
    await expect(api.files.update(f.id, { title: ' ' })).rejects.toMatchObject({ status: 400, detail: 'Give the file a name.' })
    await expect(api.files.update(f.id, { description: 'x'.repeat(1001) })).rejects.toMatchObject({ status: 400, detail: 'Keep the description under 1,000 characters.' })
    await api.users.viewAs('u-2')
    await expect(api.files.update(f.id, { title: 'Mine now' })).rejects.toMatchObject({ status: 403, detail: 'Only whoever uploaded it, or an admin, can change this file.' })
  })

  it('deleting it leaves "deleted" where it was shared and throws its bytes away; an Admin may delete anyone’s', async () => {
    await api.users.viewAs('u-2')
    const f = await upload('notes.txt')
    const sent = await api.chat.send('c-backend', 'Notes', undefined, undefined, [f.id])
    await api.users.viewAs('u-6')
    await expect(api.files.delete(f.id)).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-1')
    await api.files.delete(f.id)
    expect((await api.chat.message(sent.id)).attachments[0].deletedAt).toEqual(expect.any(String))
    expect(await db.getFile(f.id)).toBeFalsy()
    await expect(api.files.url(f.id)).rejects.toMatchObject({ status: 404 })
    await expect(api.files.delete(f.id)).rejects.toMatchObject({ status: 404 })
  })
})

describe('sharing a file in another channel (spec 6.9 Share)', () => {
  it('posts it with an optional message where I can post, and its details list both places', async () => {
    const f = await upload('scope.pdf')
    await api.chat.send('c-backend', 'Scope', undefined, undefined, [f.id])
    const shared = await api.files.share(f.id, 'c-general', 'For everyone')
    expect(shared).toMatchObject({ channelId: 'c-general', content: 'For everyone' })
    expect(shared.attachments.map((x) => x.id)).toEqual([f.id])
    expect((await api.files.details(f.id)).sharedIn.map((s) => s.channelId)).toEqual(['c-backend', 'c-general'])
    expect(events.some((e) => e.type === 'messageReceived' && e.message.id === shared.id)).toBe(true)
    await api.chat.updateChannel('c-general', { whoCanPost: 'admins' })
    await api.users.viewAs('u-2')
    await expect(api.files.share(f.id, 'c-general')).rejects.toMatchObject({ status: 403 })
  })
})

describe('security review of part A', () => {
  it('only whoever uploaded a file, or an Admin, shares it, so nobody else can carry it to a wider channel', async () => {
    const f = await upload('secret.pdf', 'c-release')
    await api.chat.send('c-release', 'Scope', undefined, undefined, [f.id])
    await api.users.viewAs('u-2')
    await expect(api.files.share(f.id, 'c-general', 'Everyone should see')).rejects.toMatchObject({ status: 403, detail: 'Only whoever uploaded it, or an admin, can share this file.' })
    expect((await api.files.details(f.id)).sharedIn.map((s) => s.channelId)).toEqual(['c-release'])
  })

  it('an archived project’s or channel’s file can’t be edited or deleted until it’s restored', async () => {
    await api.projects.archive('p-mob')
    const frozen = { status: 400, detail: 'This project is archived. Restore it first.' }
    await expect(api.files.delete('a-mob-scope')).rejects.toMatchObject(frozen)
    await expect(api.files.update('a-mob-scope', { title: 'New' })).rejects.toMatchObject(frozen)
    const ops = await api.chat.createChannel({ workspaceId: 'ws-eng', name: 'ops', topic: '', isPrivate: false, memberIds: [] })
    const f = await upload('notes.txt', ops.id)
    await api.chat.send(ops.id, 'Notes', undefined, undefined, [f.id])
    await api.chat.archiveChannel(ops.id)
    await expect(api.files.delete(f.id)).rejects.toMatchObject({ status: 400, detail: 'This channel is archived.' })
    await expect(api.files.update(f.id, { title: 'New' })).rejects.toMatchObject({ status: 400, detail: 'This channel is archived.' })
  })
})

describe('slice 6 review minors (mock)', () => {
  it('Undo of a deleted message brings back the file as it is now, not as it was', async () => {
    const f = await upload('scope.pdf')
    const a = await api.chat.send('c-backend', 'A', undefined, undefined, [f.id])
    await api.files.share(f.id, 'c-general')
    await api.chat.remove({ kind: 'message', id: a.id })
    await api.files.update(f.id, { title: 'Release scope' })
    await api.files.delete(f.id)
    await api.chat.restore({ kind: 'message', id: a.id })
    expect((await api.chat.message(a.id)).attachments[0]).toMatchObject({ title: 'Release scope', deletedAt: expect.any(String) })
  })

  it('a file still being checked can’t be opened', async () => {
    const f = await upload('scope.pdf')
    await api.chat.send('c-backend', 'A', undefined, undefined, [f.id])
    await db.update((data) => {
      data.attachments.find((x) => x.id === f.id)!.scanStatus = 'pending'
    })
    await expect(api.files.url(f.id)).rejects.toMatchObject({ status: 400, detail: 'This file is still being checked.' })
  })

  it('a file sent in a thread reply is sent: its uploader loses it with the channel', async () => {
    await api.users.viewAs('u-2')
    const root = await api.chat.send('c-release', 'Root')
    const f = await upload('notes.pdf', 'c-release')
    await api.chat.reply(root.id, 'Notes', undefined, false, [f.id])
    await api.users.viewAs('u-1')
    await api.chat.removeMember('c-release', 'u-2')
    await api.users.viewAs('u-2')
    await expect(api.files.url(f.id)).rejects.toMatchObject({ status: 404 })
    await expect(api.files.details(f.id)).rejects.toMatchObject({ status: 404 })
  })

  it('a message with a file can have its text edited away; one without can’t', async () => {
    const f = await upload('scope.pdf')
    const withFile = await api.chat.send('c-backend', 'Here', undefined, undefined, [f.id])
    expect((await api.chat.edit({ kind: 'message', id: withFile.id }, '', [])).content).toBe('')
    const plain = await api.chat.send('c-backend', 'Plain')
    await expect(api.chat.edit({ kind: 'message', id: plain.id }, '', [])).rejects.toMatchObject({ status: 400, detail: 'Write a message first.' })
  })
})

describe('a text snippet (spec 6.9): a .txt chat file with a language', () => {
  it('keeps its language, and its title is the name without .txt', async () => {
    const uploaded = await api.files.uploadForChat('c-backend', file('explain-query.txt', 'SELECT 1;', 'text/plain'), { snippet: { language: 'sql' } })
    expect(uploaded).toMatchObject({ name: 'explain-query.txt', title: 'explain-query', snippet: { language: 'sql' }, mimeType: 'text/plain' })
    expect((await upload('scope.pdf')).snippet).toBeNull()
  })

  it('refuses a language it doesn’t know and a snippet that isn’t .txt', async () => {
    await expect(api.files.uploadForChat('c-backend', file('a.txt', 'x', 'text/plain'), { snippet: { language: 'cobol' as never } })).rejects.toMatchObject({ status: 400, detail: "That snippet type isn't supported." })
    await expect(api.files.uploadForChat('c-backend', file('a.pdf'), { snippet: { language: 'sql' } })).rejects.toMatchObject({ status: 400, detail: 'A snippet is a .txt file.' })
  })
})

describe('Add from Flow files (spec 6.8 Attach menu): the files I may share', () => {
  const pdf = (name: string) => file(name, '%PDF-1.4 x', 'application/pdf')
  it('lists my files where they are, newest first, searchable; not someone else’s', async () => {
    const mine = await upload('scope.pdf')
    await api.chat.send('c-backend', '', undefined, undefined, [mine.id])
    await api.users.viewAs('u-2')
    const theirs = await api.files.uploadForChat('c-backend', pdf('theirs.pdf'))
    await api.chat.send('c-backend', '', undefined, undefined, [theirs.id])
    await api.users.viewAs('u-5')
    expect((await api.files.shareable('ws-eng')).map((s) => s.file.name)).not.toContain('theirs.pdf')
    await api.users.viewAs('u-2')
    const list = await api.files.shareable('ws-eng')
    expect(list.map((s) => s.file.name)).toContain('theirs.pdf')
    expect(list.map((s) => s.file.name)).not.toContain('scope.pdf')
    expect(list.find((s) => s.file.name === 'theirs.pdf')).toMatchObject({ channelId: 'c-backend' })
    expect((await api.files.shareable('ws-eng', 'THEI')).map((s) => s.file.name)).toEqual(['theirs.pdf'])
  })

  it('an Admin may pick and send anyone’s file they can see; others only their own', async () => {
    await api.users.viewAs('u-2')
    const theirs = await api.files.uploadForChat('c-backend', pdf('theirs.pdf'))
    await api.chat.send('c-backend', '', undefined, undefined, [theirs.id])
    await api.users.viewAs('u-1')
    expect((await api.files.shareable('ws-eng')).map((s) => s.file.name)).toContain('theirs.pdf')
    await expect(api.chat.send('c-general', '', undefined, undefined, [theirs.id])).resolves.toMatchObject({ attachments: [{ id: theirs.id }] })
    await api.users.viewAs('u-5')
    await expect(api.chat.send('c-general', '', undefined, undefined, [theirs.id])).rejects.toMatchObject({ status: 403 })
  })
})
