import type { AuditAction, AuditChange, AuditEvent, AuditGroup, AuditRecord, AuditResult, Channel, Phase, Project, Role, StoredChannel, Ticket, TimeEntry, User } from '@/api/types'
import { chainEvent, GENESIS } from '@/lib/auditChain'
import { formatDate, formatTime } from '@/lib/format'
import type { DbData } from './db'
import { newId } from './shared'

// The audit log as the mock server keeps it (Admin and help, slice 2): one chained entry per recorded write, appended
// in the same transaction as the change it records, never after it. What is and isn't recorded is listed, method by
// method, in audit.test.ts.

// ── Where a request comes from ───────────────────────────────────────────────

export type RequestInfo = { ip: string | null; device: string | null }

/** "Chrome 130 · macOS" from a browser's user agent; null when there's none (Node, tests). */
export function deviceOf(userAgent: string | undefined): string | null {
  if (!userAgent) return null
  const browser =
    /Edg\/(\d+)/.exec(userAgent)?.[1] !== undefined
      ? `Edge ${/Edg\/(\d+)/.exec(userAgent)![1]}`
      : /Firefox\/(\d+)/.test(userAgent)
        ? `Firefox ${/Firefox\/(\d+)/.exec(userAgent)![1]}`
        : /Chrome\/(\d+)/.test(userAgent)
          ? `Chrome ${/Chrome\/(\d+)/.exec(userAgent)![1]}`
          : /Version\/(\d+).*Safari/.test(userAgent)
            ? `Safari ${/Version\/(\d+)/.exec(userAgent)![1]}`
            : 'Browser'
  const os = /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Mac OS X/.test(userAgent) ? 'macOS' : /Windows/.test(userAgent) ? 'Windows' : /Linux/.test(userAgent) ? 'Linux' : 'Unknown'
  return `${browser} · ${os}`
}

const IP_KEY = 'spark-flow.demo-ip'

/**
 * In the prototype: a browser can't know its own public address, so each browser gets a made-up one, kept, and Help
 * says so. The backend records the real one from the request.
 */
function demoIp(): string {
  try {
    const kept = localStorage.getItem(IP_KEY)
    if (kept) return kept
    const made = `156.199.${1 + Math.floor(Math.random() * 254)}.${1 + Math.floor(Math.random() * 254)}`
    localStorage.setItem(IP_KEY, made)
    return made
  } catch {
    return '156.199.4.21'
  }
}

let requestInfo: () => RequestInfo = () => ({ ip: typeof navigator === 'undefined' ? null : demoIp(), device: deviceOf(globalThis.navigator?.userAgent) })

/** Where this request comes from: its IP and device, as the server sees them. */
export const requestFrom = (): RequestInfo => requestInfo()

/** Tests fix where requests come from. */
export function setRequestInfo(info: () => RequestInfo) {
  requestInfo = info
}

// ── Writing an entry ─────────────────────────────────────────────────────────

export type Actor = { id: string | null; name: string; roles: string }

/** Someone as the log names them: their name and roles now (kept as they were, since both can change). */
export function actorFor(data: Pick<DbData, 'roles'>, user: User): Actor {
  return { id: user.id, name: user.name, roles: data.roles.filter((r) => user.roleIds.includes(r.id)).map((r) => r.name).join(', ') }
}

export type AuditInput = {
  action: AuditAction
  group: AuditGroup
  record: AuditRecord | null
  changes?: AuditChange[]
  result?: AuditResult
  detail?: string | null
  /** Who, when it isn't the current person (a failed sign-in, the seed). */
  actor?: Actor
  at?: string
  /** Where it came from, when it isn't this request (the seed's history). */
  from?: RequestInfo
  /** The seed's own, so the same `now` seeds the same log. */
  requestId?: string
}

/** Appends one entry, chained to the last, inside the caller's write. Times only go forward, as the seq does. */
export function audit(data: DbData, input: AuditInput): AuditEvent {
  const last = data.audit.at(-1)
  const me = data.users.find((u) => u.id === data.currentUserId)
  const actor = input.actor ?? (me ? actorFor(data, me) : { id: null, name: 'Unknown', roles: '' })
  const now = input.at ?? new Date().toISOString()
  const at = last && last.at >= now ? new Date(new Date(last.at).getTime() + 1).toISOString() : now
  const { ip, device } = input.from ?? requestInfo()
  const event = chainEvent(
    {
      seq: (last?.seq ?? 0) + 1,
      at,
      actorId: actor.id,
      actorName: actor.name,
      actorRoles: actor.roles,
      action: input.action,
      group: input.group,
      record: input.record,
      changes: input.changes ?? [],
      result: input.result ?? 'done',
      detail: input.detail ?? null,
      ip,
      device,
      requestId: input.requestId ?? newId('req'),
    },
    last?.hash ?? GENESIS,
  )
  data.audit.push(event)
  return event
}

// ── What a record is called ──────────────────────────────────────────────────

export const recordOf = {
  project: (p: Pick<Project, 'id' | 'name'>): AuditRecord => ({ type: 'project', id: p.id, name: p.name }),
  task: (t: Pick<Ticket, 'key' | 'title'>): AuditRecord => ({ type: 'task', id: t.key, name: `${t.key} · ${t.title}` }),
  phase: (ph: Pick<Phase, 'id' | 'name'>, project: Pick<Project, 'name'> | undefined): AuditRecord => ({ type: 'phase', id: ph.id, name: project ? `${ph.name} · ${project.name}` : ph.name }),
  deliverable: (d: { id: string; title: string }, project: Pick<Project, 'name'> | undefined): AuditRecord => ({ type: 'deliverable', id: d.id, name: project ? `${d.title} · ${project.name}` : d.title }),
  channel: (c: Pick<StoredChannel | Channel, 'id' | 'name' | 'kind'>): AuditRecord => ({ type: 'channel', id: c.id, name: c.kind === 'dm' ? 'A direct message' : `#${c.name ?? ''}` }),
  role: (r: Pick<Role, 'id' | 'name'>): AuditRecord => ({ type: 'role', id: r.id, name: r.name }),
  user: (u: Pick<User, 'id' | 'name'>): AuditRecord => ({ type: 'user', id: u.id, name: u.name }),
  file: (f: { id: string; title?: string; name: string }): AuditRecord => ({ type: 'file', id: f.id, name: f.title || f.name }),
  /** "Karim Hasan · Nexus Core · 30 Oct 2026": whose, where and which day. */
  timeEntry: (data: DbData, e: Pick<TimeEntry, 'id' | 'userId' | 'projectId' | 'startedAt'>): AuditRecord => ({
    type: 'timeEntry',
    id: e.id,
    name: [data.users.find((u) => u.id === e.userId)?.name ?? 'Someone', data.projects.find((p) => p.id === e.projectId)?.name ?? 'A project', formatDate(e.startedAt)].join(' · '),
  }),
}

/** The kinds of record, as the page's filter names them. */
export const RECORD_TYPES: Record<string, string> = {
  project: 'Projects',
  task: 'Tasks',
  phase: 'Phases',
  deliverable: 'Deliverables',
  team: 'Teams',
  channel: 'Channels',
  message: 'Messages',
  file: 'Files',
  timeEntry: 'Time entries',
  rate: 'Hourly costs',
  role: 'Roles',
  user: 'People',
  data: 'Demo data',
  report: 'Reports',
  auditLog: 'Audit log',
  settings: 'Settings',
  request: 'Requests',
}

// ── What changed, as people read it ──────────────────────────────────────────

/** A stored time, as the server writes them; text that only starts like one stays text. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
/** Fields that hold a day, stored as its midnight: shown without a time. */
const DAYS = new Set(['dueDate', 'startDate', 'dueAt'])
const LONG = 80

/** "onHold" → "On hold", "inProgress" → "In progress": a stored choice as people read it. */
export function humanize(value: string): string {
  const words = value.replace(/([A-Z])/g, ' $1').trim().toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Fields whose values are one of a few choices (statuses, priority, who can post). */
const CHOICES = new Set(['status', 'priority', 'type', 'methodology', 'whoCanPost', 'category'])
const CHOICE_LABELS: Record<string, string> = { admins: 'Only admins' }

/** A value as the log shows it: names for ids, a date for a time, On or Off, text cut at 80 characters; null if empty. */
export function shown(data: DbData, field: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const person = (id: string) => data.users.find((u) => u.id === id)?.name ?? 'Someone'
  if (Array.isArray(value)) {
    if (value.length === 0) return null
    if (field === 'memberIds' || field === 'userIds') return value.map((id) => person(String(id))).join(', ')
    if (field === 'teamIds') return value.map((id) => data.teams.find((t) => t.id === id)?.name ?? 'A team').join(', ')
    if (field === 'roleIds') return value.map((id) => data.roles.find((r) => r.id === id)?.name ?? 'A role').join(', ')
    if (field === 'links') return value.map((l) => (l as { label?: string }).label || 'Link').join(', ')
    return value.map(String).join(', ')
  }
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return JSON.stringify(value).slice(0, LONG)
  if (['managerId', 'assigneeId', 'reporterId', 'userId'].includes(field)) return person(value)
  if (field === 'phaseId') return data.phases.find((p) => p.id === value)?.name ?? 'A phase'
  if (field === 'sprintId') return data.sprints.find((s) => s.id === value)?.name ?? 'A sprint'
  if (field === 'projectId') return data.projects.find((p) => p.id === value)?.name ?? 'A project'
  if (field === 'taskId') return data.tickets.find((t) => t.id === value)?.key ?? 'A task'
  if (field === 'folderId') return data.folders.find((f) => f.id === value)?.name ?? 'A folder'
  if (field === 'logoFileId') return data.attachments.find((a) => a.id === value)?.title ?? 'A file'
  if (CHOICES.has(field)) return CHOICE_LABELS[value] ?? humanize(value)
  if (ISO.test(value) && !Number.isNaN(Date.parse(value))) return DAYS.has(field) ? formatDate(value) : `${formatDate(value)}, ${formatTime(value)}`
  return value.length > LONG ? `${value.slice(0, LONG - 1)}…` : value
}

/** "dueDate" → "Due date"; "managerId" → "Manager". */
export function fieldLabel(field: string): string {
  const named: Record<string, string> = {
    managerId: 'Manager', assigneeId: 'Assignee', memberIds: 'Members', teamIds: 'Teams', roleIds: 'Roles', phaseId: 'Phase', sprintId: 'Sprint', userIds: 'People',
    dueAt: 'Due', estimateHours: 'Estimate (hours)', storyPoints: 'Story points', whoCanPost: 'Who can post', isDefault: 'Default channel',
    isPrivate: 'Private', clientName: 'Client', doneAt: 'Done', hourlyCost: 'Hourly cost (EGP)', startedAt: 'Start', endedAt: 'End',
    projectId: 'Project', taskId: 'Task', folderId: 'Folder', logoFileId: 'Logo', userId: 'Person',
  }
  return named[field] ?? humanize(field)
}

/** A value to compare: empty ('', [], null, missing) is null, and lists of ids are sets (the same people in another order are no change). */
const comparable = (field: string, value: unknown) => {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null
  return field.endsWith('Ids') && Array.isArray(value) ? [...value].map(String).sort() : value
}

/** The fields that differ between two versions of a record, each as people read it then. */
export function changesBetween(data: DbData, before: object, after: object, fields: readonly string[]): AuditChange[] {
  const b = before as Record<string, unknown>
  const a = after as Record<string, unknown>
  const out: AuditChange[] = []
  for (const field of fields) {
    if (JSON.stringify(comparable(field, b[field])) === JSON.stringify(comparable(field, a[field]))) continue
    out.push({ field: fieldLabel(field), from: shown(data, field, b[field]), to: shown(data, field, a[field]) })
  }
  return out
}

// ── The demo's history ───────────────────────────────────────────────────────

/**
 * A few days of history for the demo (the seed): sign-ins, changes, a role change, a burst of failed sign-ins and a
 * refusal, so the page and its "Needs a look" have something to show. Chained like any other entries.
 */
export function seedAuditHistory(data: DbData, now: Date) {
  const day = 86_400_000
  const at = (daysAgo: number, hh: number, mm: number) => {
    const d = new Date(now.getTime() - daysAgo * day)
    d.setHours(hh, mm, 0, 0)
    return d.toISOString()
  }
  const person = (id: string) => data.users.find((u) => u.id === id)!
  const who = (id: string) => actorFor(data, person(id))
  const signIn = (id: string) => ({ actor: who(id), action: 'signedIn' as const, group: 'access' as const, record: recordOf.user(person(id)), detail: 'Password' })
  const mac = { ip: '156.199.4.21', device: 'Chrome 130 · macOS' }
  const office = { ip: '41.233.18.9', device: 'Chrome 130 · Windows' }
  const nex = data.projects.find((p) => p.id === 'p-nex') ?? data.projects[0]
  const sales = data.roles.find((r) => r.id === 'sales')
  const entries: (AuditInput & { at: string })[] = [
    { at: at(3, 9, 2), from: mac, ...signIn('u-1') },
    { at: at(3, 9, 14), actor: who('u-1'), from: mac, action: 'changed', group: 'data', record: recordOf.project(nex), changes: [{ field: 'Due date', from: '28 Nov 2026', to: '5 Dec 2026' }] },
    { at: at(2, 10, 5), from: office, ...signIn('u-2') },
    { at: at(2, 14, 30), actor: who('u-1'), from: mac, action: 'changed', group: 'settings', record: sales ? recordOf.role(sales) : null, changes: [{ field: 'See the dashboard for every project', from: 'Off', to: 'On' }] },
    { at: at(1, 9, 40), from: { ip: '102.41.7.88', device: 'Edge 130 · Windows' }, ...signIn('u-9') },
    { at: at(1, 16, 20), actor: who('u-1'), from: mac, action: 'exported', group: 'exports', record: { type: 'data', id: 'all', name: 'All demo data' }, detail: 'Database export' },
    ...[0, 2, 4].map((m): AuditInput & { at: string } => ({
      at: at(1, 23, 55 + m),
      actor: { id: null, name: 'k.hasan@spark-sys.com', roles: '' },
      from: { ip: '105.196.66.3', device: 'Chrome 130 · Windows' },
      action: 'signInFailed',
      group: 'access',
      record: null,
      result: 'failed',
      detail: 'Wrong password',
    })),
    { at: at(0, 8, 31), from: office, ...signIn('u-3') },
    { at: at(0, 8, 33), actor: who('u-3'), from: office, action: 'denied', group: 'access', record: { type: 'request', id: 'rates.list', name: 'rates.list' }, result: 'refused', detail: "You don't have access to hourly costs." },
  ]
  entries.forEach((entry, i) => {
    if (entry.at <= now.toISOString()) audit(data, { ...entry, requestId: `req-seed-${i + 1}` })
  })
}
