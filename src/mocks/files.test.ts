import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api, Attachment, UploadFile } from '@/api/types'
import { createDb, type MockDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'
import { fileInUse, fileRecord } from './files'
import { fileKind } from '@/lib/fileTypes'

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
    await expect(api.files.upload('p-mob', file('run.exe', ['MZ'], 'application/octet-stream'))).rejects.toMatchObject({ status: 400, detail: "That type of file can’t be added." })
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


describe('task files', () => {
  it('a file is in use in a message, a reply, the Undo trash, a project file, a comment or a task; not a fresh unsent upload', async () => {
    const fresh = await api.files.uploadForChat('c-general', file('x.pdf', ['%PDF-1.4 x']))
    const data = structuredClone(await db.read())
    const att = (id: string) => ({ id }) as Attachment
    data.messages[0]!.attachments.push(att('f-msg'))
    data.replies[0]!.attachments.push(att('f-reply'))
    data.trash.push({ snapshot: { attachments: [att('f-trash')] } } as never)
    for (const id of ['f-msg', 'f-reply', 'f-trash', 'a-mob-scope', 'a-shot-105', 'a-nex-101-flow']) expect(fileInUse(data, id), id).toBe(true)
    expect(fileInUse(data, fresh.id)).toBe(false)
  })

  it('people on the task’s project see and open its file; others get 403 and 404', async () => {
    await api.users.viewAs('u-3')
    expect((await api.files.details('a-nex-101-flow')).taskKeys).toContain('NEX-101')
    expect((await api.files.url('a-nex-101-flow')).startsWith('blob:')).toBe(true)
    await api.users.viewAs('u-8')
    await expect(api.files.url('a-nex-101-flow')).rejects.toMatchObject({ status: 403 })
    await expect(api.files.details('a-nex-101-flow')).rejects.toMatchObject({ status: 404 })
  })

  it('removing a project file a task also has keeps the file and its bytes', async () => {
    const stored = await api.files.upload('p-nex', file('spec.pdf', ['%PDF-1.4 spec']))
    await db.update((data) => {
      data.tickets.find((t) => t.key === 'NEX-102')!.attachmentIds.push(stored.attachmentId)
    })
    await api.files.removeFromProject('p-nex', stored.attachmentId)
    expect((await db.read()).attachments.some((a) => a.id === stored.attachmentId)).toBe(true)
    expect(await db.getFile(stored.attachmentId)).not.toBeNull()
  })
})

describe('uploading a task’s file', () => {
  it('a task editor uploads with progress; the file is theirs until a task names it', async () => {
    await api.users.viewAs('u-2')
    const progress: number[] = []
    const up = await api.files.uploadForTask('p-nex', file('flow.pdf', ['%PDF-1.4 flow']), { onProgress: (p) => progress.push(p) })
    expect(up).toMatchObject({ uploadedBy: 'u-2', scanStatus: 'clean', name: 'flow.pdf' })
    expect(progress).toEqual([0.25, 0.5, 0.75, 1])
    expect((await api.files.url(up.id)).startsWith('blob:')).toBe(true)
    await api.users.viewAs('u-3')
    await expect(api.files.url(up.id)).rejects.toMatchObject({ status: 404 })
  })

  it('only someone who edits the project’s tasks, on a project not archived', async () => {
    await api.users.viewAs('u-3')
    await expect(api.files.uploadForTask('p-nex', file('a.pdf', ['%PDF-1.4 a']))).rejects.toMatchObject({ status: 403 })
    await api.users.viewAs('u-1')
    await api.projects.archive('p-sel', 'Lost')
    await expect(api.files.uploadForTask('p-sel', file('a.pdf', ['%PDF-1.4 a']))).rejects.toMatchObject({ status: 400 })
  })

  it('a cancelled or empty upload stores nothing', async () => {
    const count = (await db.read()).attachments.length
    const controller = new AbortController()
    controller.abort()
    await expect(api.files.uploadForTask('p-nex', file('a.pdf', ['%PDF-1.4 a']), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await expect(api.files.uploadForTask('p-nex', file('e.pdf', []))).rejects.toMatchObject({ status: 400, detail: 'That file is empty.' })
    expect((await db.read()).attachments).toHaveLength(count)
  })
})

describe('a project’s files (the Files tab)', () => {
  const pdf = (name: string) => file(name, ['%PDF-1.4 x'])
  /** One of each place on NEX, as its manager: Overview, a task, a comment and the chat. */
  const fourPlaces = async () => {
    await api.users.viewAs('u-2')
    const overview = await api.files.upload('p-nex', pdf('overview.pdf'))
    const task = await api.files.uploadForTask('p-nex', pdf('task.pdf'))
    await api.tasks.update('NEX-102', { attachmentIds: [task.id] })
    const comment = await api.comments.create({ taskKey: 'NEX-102', kind: 'comment', body: 'See the log', files: [file('log.txt', ['x'], 'text/plain')] })
    const chatFile = await api.files.uploadForChat('c-p-nex', pdf('chat.pdf'))
    const message = await api.chat.send('c-p-nex', 'Here it is', undefined, undefined, [chatFile.id])
    return { overview: overview.attachmentId, task: task.id, comment, commentFile: comment.attachments[0]!.id, chat: chatFile.id, message }
  }

  it('lists each file once, from where it was added first, newest first; a comment’s chat card adds no row', async () => {
    const p = await fourPlaces()
    const { items } = await api.files.inProject('p-nex', {})
    const sourceOf = (id: string) => items.filter((row) => row.file.id === id).map((row) => row.source)
    expect(sourceOf(p.overview)).toEqual([{ kind: 'overview' }])
    expect(sourceOf(p.task)).toEqual([{ kind: 'task', taskKey: 'NEX-102' }])
    expect(sourceOf(p.commentFile)).toEqual([{ kind: 'comment', taskKey: 'NEX-102', commentId: p.comment.id, bug: false }])
    expect(sourceOf(p.chat)).toEqual([{ kind: 'chat', messageId: p.message.id, replyId: null }])
    expect(sourceOf('a-shot-105')).toEqual([{ kind: 'comment', taskKey: 'NEX-105', commentId: 'cm-002', bug: true }])
    expect(sourceOf('a-nex-101-flow')).toEqual([{ kind: 'task', taskKey: 'NEX-101' }])
    const times = items.map((row) => row.file.createdAt)
    expect(times).toEqual([...times].sort().reverse())
  })

  it('a project file shared into the chat still lists once, under Overview', async () => {
    const p = await fourPlaces()
    await api.files.share(p.overview, 'c-p-nex')
    const rows = (await api.files.inProject('p-nex', {})).items.filter((row) => row.file.id === p.overview)
    expect(rows.map((row) => row.source)).toEqual([{ kind: 'overview' }])
  })

  it('filters by where and by type; a deleted file is gone', async () => {
    const p = await fourPlaces()
    expect((await api.files.inProject('p-nex', { from: 'chat' })).items.map((row) => row.file.id)).toEqual([p.chat])
    const pdfs = (await api.files.inProject('p-nex', { type: 'pdf' })).items
    expect(pdfs.length).toBeGreaterThan(0)
    expect(pdfs.every((row) => fileKind(row.file) === 'pdf')).toBe(true)
    await api.files.delete(p.task)
    expect((await api.files.inProject('p-nex', {})).items.some((row) => row.file.id === p.task)).toBe(false)
  })

  it('50 a page, with a cursor for the rest', async () => {
    await db.update((data) => {
      for (let i = 0; i < 51; i++) {
        const a = { ...fileRecord({ name: `f${i}.pdf`, type: 'application/pdf', size: 1 }, 'u-2', new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()), id: `f-${i}` }
        data.attachments.push(a)
        data.projectFiles.push({ id: `pf-${i}`, projectId: 'p-nex', attachmentId: a.id, uploadedBy: 'u-2', createdAt: a.createdAt })
      }
    })
    const first = await api.files.inProject('p-nex', {})
    expect(first.items).toHaveLength(50)
    expect(first.nextCursor).toBe('50')
    const rest = await api.files.inProject('p-nex', { cursor: '50' })
    expect(rest.items.length).toBe(53 - 50) // 51 here, NEX-101's file and the bug's screenshot
    expect(rest.nextCursor).toBeNull()
  })

  it('someone off the project sees only the chat places they can read; a row never names a place they can’t open', async () => {
    const p = await fourPlaces()
    await api.files.share(p.overview, 'c-p-nex')
    await api.users.viewAs('u-8')
    const rows = (await api.files.inProject('p-nex', {})).items
    expect(rows.every((row) => row.source.kind === 'chat')).toBe(true)
    // The shared project file lists where they can reach it; a comment's file (only on its card) doesn't list.
    expect(rows.map((row) => row.file.id).sort()).toEqual([p.chat, p.overview].sort())
  })
})
