import { describe, expect, it } from 'vitest'
import { localDay } from '@/lib/dates'
import { DB_VERSION } from './db'
import { seed } from './seed'
import { projectPeopleIds } from '@/lib/projectPeople'
import { parseMentions, parseTicketKeys } from './text'
import { descriptionText } from '@/lib/messageBody'
import { scopePdf } from './seedFiles'

const now = new Date('2026-10-26T12:00:00Z') // a Monday
const { data, files } = seed(now)
const hours = (e: { startedAt: string; endedAt: string | null }) =>
  ((e.endedAt ? new Date(e.endedAt).getTime() : now.getTime()) - new Date(e.startedAt).getTime()) / 3_600_000

describe('seed', () => {
  it('has the people, roles and teams of the demo story', () => {
    expect(data.version).toBe(DB_VERSION)
    expect(data.users).toHaveLength(9)
    expect(data.currentUserId).toBe('u-1')
    const roleOf = Object.fromEntries(data.users.map((u) => [u.id, u.roleIds.join()]))
    expect(roleOf['u-1']).toBe('admin')
    expect(roleOf['u-9']).toBe('sales')
    expect([roleOf['u-2'], roleOf['u-4']]).toEqual(['pm', 'pm'])
    expect(new Set(data.users.map((u) => u.roleIds.join()))).toEqual(new Set(['admin', 'sales', 'pm', 'member']))
    expect(data.roles.map((r) => r.id)).toEqual(['admin', 'sales', 'pm', 'member'])
    expect(data.teams.map((t) => t.id)).toEqual(['t-frontend', 't-backend', 't-mobile', 't-qa'])
    for (const team of data.teams) for (const id of team.memberIds) expect(data.users.find((u) => u.id === id)?.teamIds).toContain(team.id)
  })

  it('has 4 Engineering projects in different states, plus Brand Refresh', () => {
    const byKey = Object.fromEntries(data.projects.map((p) => [p.key, p]))
    expect(Object.keys(byKey)).toEqual(['NEX', 'MOB', 'ELM', 'SEL', 'BRD'])
    expect(byKey.NEX).toMatchObject({ methodology: 'agile', status: 'active', managerId: 'u-2' })
    expect(byKey.MOB).toMatchObject({ methodology: 'waterfall', status: 'active', managerId: 'u-4' })
    expect(byKey.ELM).toMatchObject({ methodology: 'waterfall', status: 'delivered' })
    expect(byKey.SEL).toMatchObject({ methodology: 'waterfall', status: 'planned' })
    expect(byKey.BRD.workspaceId).toBe('ws-design')
    expect(byKey.MOB.dueDate < now.toISOString()).toBe(true) // MOB is late
  })

  it('gives every project phases, deliverables and 2+ tasks; sprints only on agile projects', () => {
    for (const p of data.projects) {
      expect(data.phases.filter((ph) => ph.projectId === p.id).length).toBeGreaterThanOrEqual(2)
      expect(data.deliverables.filter((d) => d.projectId === p.id).length).toBeGreaterThanOrEqual(1)
      expect(data.tickets.filter((t) => t.projectId === p.id).length).toBeGreaterThanOrEqual(2)
      const sprints = data.sprints.filter((s) => s.projectId === p.id)
      if (p.methodology === 'agile') expect(sprints.map((s) => s.state).sort()).toEqual(['active', 'planned'])
      else expect(sprints).toEqual([])
    }
    for (const t of data.tickets) if (t.sprintId) expect(data.projects.find((p) => p.id === t.projectId)?.methodology).toBe('agile')
    expect(data.tickets.filter((t) => t.projectId === 'p-elm').every((t) => t.status === 'done')).toBe(true)
    expect(data.phases.filter((ph) => ph.projectId === 'p-elm').every((ph) => ph.status === 'done')).toBe(true)
  })

  it('has bugs, and MOB has overdue tasks by both rules', () => {
    expect(data.tickets.filter((t) => t.type === 'bug').length).toBeGreaterThanOrEqual(5)
    const mob = data.tickets.filter((t) => t.projectId === 'p-mob')
    const pastDue = mob.filter((t) => t.status !== 'done' && t.dueAt !== null && t.dueAt < now.toISOString())
    expect(pastDue.length).toBeGreaterThanOrEqual(1)
    const logged = (taskId: string) => data.timeEntries.filter((e) => e.taskId === taskId).reduce((sum, e) => sum + hours(e), 0)
    const overEstimate = mob.filter((t) => t.estimateHours !== null && logged(t.id) > t.estimateHours)
    expect(overEstimate.map((t) => t.key)).toContain('MOB-104')
  })

  it("each project's channel holds exactly its people (the rule every project edit keeps)", () => {
    for (const p of data.projects) {
      const channel = data.channels.find((c) => c.id === p.channelId)!
      expect(new Set(channel.memberIds)).toEqual(projectPeopleIds(p, data.users))
    }
  })

  it('resolves every reference', () => {
    const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id))
    const users = ids(data.users), teams = ids(data.teams), projects = ids(data.projects), phases = ids(data.phases)
    const sprints = ids(data.sprints), channels = ids(data.channels), messages = ids(data.messages)
    const attachments = ids(data.attachments), workspaces = ids(data.workspaces)
    for (const p of data.projects) {
      expect(workspaces.has(p.workspaceId)).toBe(true)
      expect(users.has(p.managerId)).toBe(true)
      expect(channels.has(p.channelId)).toBe(true)
      for (const id of p.memberIds) expect(users.has(id)).toBe(true)
      for (const id of p.teamIds) expect(teams.has(id)).toBe(true)
    }
    for (const ph of data.phases) expect(projects.has(ph.projectId)).toBe(true)
    for (const d of data.deliverables) {
      expect(projects.has(d.projectId)).toBe(true)
      if (d.phaseId) expect(phases.has(d.phaseId)).toBe(true)
    }
    for (const s of data.sprints) expect(projects.has(s.projectId)).toBe(true)
    for (const t of data.tickets) {
      expect(projects.has(t.projectId)).toBe(true)
      if (t.phaseId) expect(data.phases.find((ph) => ph.id === t.phaseId)?.projectId).toBe(t.projectId)
      if (t.assigneeId) expect(users.has(t.assigneeId)).toBe(true)
      expect(users.has(t.reporterId)).toBe(true)
      if (t.sprintId) expect(sprints.has(t.sprintId)).toBe(true)
      if (t.linkedMessageId) expect(messages.has(t.linkedMessageId)).toBe(true)
      if (t.linkedChannelId) expect(channels.has(t.linkedChannelId)).toBe(true)
    }
    for (const c of data.channels) for (const id of c.memberIds) expect(users.has(id)).toBe(true)
    for (const m of data.messages) {
      expect(channels.has(m.channelId)).toBe(true)
      expect(users.has(m.senderId)).toBe(true)
    }
    for (const r of data.replies) expect(data.messages.find((m) => m.id === r.messageId)?.channelId).toBe(r.channelId)
    for (const c of data.comments) {
      expect(data.tickets.find((t) => t.id === c.taskId)?.projectId).toBe(c.projectId)
      expect(users.has(c.authorId)).toBe(true)
      for (const id of c.attachmentIds) expect(attachments.has(id)).toBe(true)
    }
    for (const f of data.projectFiles) {
      expect(projects.has(f.projectId)).toBe(true)
      expect(attachments.has(f.attachmentId)).toBe(true)
    }
    for (const a of data.attachments) expect(files[a.id]?.mimeType).toBe(a.mimeType)
    for (const e of data.timeEntries) {
      expect(users.has(e.userId)).toBe(true)
      expect(data.tickets.find((t) => t.id === e.taskId)?.projectId).toBe(e.projectId)
    }
    for (const r of data.rates) expect(users.has(r.userId)).toBe(true)
    expect(users.has(data.currentUserId)).toBe(true)
  })

  it('has unique ids and keys numbered from 101 per project', () => {
    for (const list of [data.users, data.projects, data.phases, data.tickets, data.channels, data.messages, data.replies, data.comments, data.timeEntries]) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length)
    }
    for (const p of data.projects) {
      const numbers = data.tickets.filter((t) => t.projectId === p.id).map((t) => Number(t.key.split('-')[1]))
      expect(Math.min(...numbers)).toBe(101)
      expect(data.counters[p.id]).toBe(Math.max(...numbers) + 1)
    }
  })

  it('never mentions a ticket before it exists', () => {
    const created = new Map(data.tickets.map((t) => [t.key, t.createdAt]))
    const said = [...data.messages, ...data.replies, ...data.comments.map((c) => ({ ...c, content: c.body }))]
    for (const item of said) {
      for (const key of parseTicketKeys(item.content)) {
        expect(created.has(key), `${key} in ${item.id}`).toBe(true)
        expect(created.get(key)! <= item.createdAt, `${key} mentioned in ${item.id} before it was created`).toBe(true)
      }
    }
    for (const c of data.comments) expect(created.get(data.tickets.find((t) => t.id === c.taskId)!.key)! <= c.createdAt).toBe(true)
  })

  it('keeps derived chat fields consistent', () => {
    for (const m of data.messages) {
      const own = data.replies.filter((r) => r.messageId === m.id)
      expect(m.threadCount).toBe(own.length)
      expect(m.linkedTicketKeys).toEqual(parseTicketKeys(m.content))
      expect(m.mentions).toEqual(parseMentions(m.content))
    }
    expect(data.messages.some((m) => m.mentions.some((x) => x.kind === 'all'))).toBe(true)
    for (const c of data.channels) {
      const times = data.messages.filter((m) => m.channelId === c.id).map((m) => m.createdAt)
      expect(new Set(times).size).toBe(times.length) // no two messages in a channel at the same moment
    }
  })

  it('logs a working week: Sun–Thu only, no overlaps, nothing running, all before now', () => {
    // The past week; today's running timers ('-now') have their own test below.
    const past = data.timeEntries.filter((e) => !e.id.endsWith('-now'))
    expect(new Set(past.map((e) => e.startedAt.slice(0, 10))).size).toBe(5)
    for (const e of past) {
      expect(e.endedAt).not.toBeNull()
      expect(e.endedAt! <= now.toISOString()).toBe(true)
      expect([5, 6]).not.toContain(new Date(e.startedAt).getUTCDay())
    }
    for (const user of data.users) {
      const mine = past.filter((e) => e.userId === user.id).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
      for (let i = 1; i < mine.length; i++) expect(mine[i - 1].endedAt! <= mine[i].startedAt).toBe(true)
    }
    expect(past.some((e) => e.source === 'manual')).toBe(true)
  })

  it('has no check-ins: Attendance days come from timer entries that say where they started (timer slice 3)', () => {
    expect(data).not.toHaveProperty('checkIns')
    const timers = data.timeEntries.filter((e) => e.source === 'timer')
    expect(timers.every((e) => e.startedFrom?.ip)).toBe(true)
    expect(data.timeEntries.filter((e) => e.source === 'manual').every((e) => !e.startedFrom)).toBe(true)
    // Each person's working day starts on time (before 9 AM in Cairo) and ends after 5 PM, but for the two exceptions
    // Attendance shows: Salma in late one day, Dina out early another.
    expect(timers.filter((e) => e.startedAt.endsWith('T07:40:00.000Z')).map((e) => e.userId)).toEqual(['u-5'])
    expect(timers.filter((e) => e.endedAt?.endsWith('T13:30:00.000Z')).map((e) => e.userId)).toEqual(['u-7'])
  })

  it('has rates for everyone, between 180 and 650 EGP an hour', () => {
    expect(data.rates.map((r) => r.userId).sort()).toEqual(data.users.map((u) => u.id).sort())
    for (const r of data.rates) expect(r.hourlyCost >= 180 && r.hourlyCost <= 650).toBe(true)
  })

  it('ships real file bytes: a PDF, a PNG and a text file', () => {
    expect(atob(files['a-mob-scope'].base64).startsWith('%PDF-')).toBe(true)
    expect(atob(files['a-shot-105'].base64).startsWith('\x89PNG')).toBe(true)
    expect(atob(files['a-mob-checklist'].base64)).toContain('Release 2.4.0 checklist')
    for (const a of data.attachments) expect(a.size).toBe(atob(files[a.id].base64).length)
  })

  it('leaves exactly 3 messages unread in #frontend-dev and 1 in one DM, all from others', () => {
    const unread = (channelId: string) =>
      data.messages.filter((m) => m.channelId === channelId && m.seq > (data.channelState[data.currentUserId]?.[channelId]?.lastReadSeq ?? 0) && m.senderId !== data.currentUserId)
    expect(unread('c-frontend')).toHaveLength(3)
    expect(data.channels.filter((c) => c.kind === 'dm').map((c) => unread(c.id).length).filter((n) => n > 0)).toEqual([1])
  })

  it('is deterministic for a given now', () => {
    expect(seed(now)).toEqual(seed(now))
  })
})

describe('demo story for now', () => {
  it('seed has three people working now, each with one running timer that says where it started', () => {
    const now = new Date()
    const { data } = seed(now)
    const running = data.timeEntries.filter((e) => e.endedAt === null)
    expect(running.map((e) => e.userId).sort()).toEqual(['u-2', 'u-3', 'u-6'])
    for (const e of running) expect(e.startedFrom?.ip).toBeTruthy()
  })

  it('just after midnight the running timers still start today', () => {
    const early = new Date(2026, 9, 28, 0, 40)
    const { data } = seed(early)
    for (const e of data.timeEntries.filter((x) => x.id.endsWith('-now'))) expect(localDay(new Date(e.startedAt))).toBe(localDay(early))
  })
})

describe('seeded history', () => {
  it('every seeded task has a created entry, by its reporter at its createdAt, oldest first', () => {
    const d = seed(new Date('2026-10-28T09:00:00Z')).data
    for (const t of d.tickets) {
      expect(d.activity).toContainEqual(expect.objectContaining({ kind: 'task.created', taskKey: t.key, projectId: t.projectId, actorId: t.reporterId, at: t.createdAt }))
    }
    expect(d.activity.every((a) => d.users.some((u) => u.id === a.actorId))).toBe(true)
    const times = d.activity.map((a) => a.at)
    expect(times).toEqual([...times].sort())
  })
})

describe('seed task descriptions', () => {
  it('every task has a file list and a plain description worked out from its body; NEX-105 is formatted', () => {
    for (const t of data.tickets) {
      expect(Array.isArray(t.attachmentIds)).toBe(true)
      expect(t.description).toBe(descriptionText(t.descriptionBody))
    }
    expect(data.tickets.find((t) => t.key === 'NEX-105')!.descriptionBody.some((b) => b.type === 'ul')).toBe(true)
  })
})

describe('seed task files', () => {
  it('NEX-101 has one file, uploaded by Nour, shown in its description', () => {
    const t = data.tickets.find((x) => x.key === 'NEX-101')!
    expect(t.attachmentIds).toEqual(['a-nex-101-flow'])
    expect(data.attachments.find((a) => a.id === 'a-nex-101-flow')).toMatchObject({ name: 'token-rotation.pdf', mimeType: 'application/pdf', uploadedBy: 'u-2' })
    expect(files['a-nex-101-flow']).toEqual({ mimeType: 'application/pdf', base64: scopePdf })
    expect(t.descriptionBody).toContainEqual({ type: 'file', id: 'a-nex-101-flow' })
  })
})

describe('channels (chat spec 6.14, the intro)', () => {
  it('every seeded channel says who made it and when', () => {
    for (const c of data.channels) {
      expect(c.memberIds, c.id).toContain(c.createdBy)
      const first = data.messages.filter((m) => m.channelId === c.id).map((m) => m.createdAt).sort()[0]
      expect(c.createdAt, c.id).toBeTruthy()
      if (first) expect(c.createdAt! <= first, c.id).toBe(true)
    }
  })
})
