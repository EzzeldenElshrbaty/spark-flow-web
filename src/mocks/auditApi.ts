import type { Api, AuditAlert, AuditEvent, AuditFilter, AuditGroup } from '@/api/types'
import { verifyChain } from '@/lib/auditChain'
import { toCsv } from '@/lib/csv'
import { can } from '@/lib/permissions'
import { audit, RECORD_TYPES, recordOf } from './audit'
import type { DbData, MockDb } from './db'
import { visibleFile } from './files'
import { delay } from './latency'
import { grantsFor } from './roles'
import { badRequest, clone, currentUser, forbidden, notFound } from './shared'

const PAGE = 50
const MINUTE = 60_000
const WEEK = 7 * 24 * 60 * MINUTE
const GROUPS: AuditGroup[] = ['data', 'status', 'access', 'settings', 'exports']

/** Whether an entry matches the filter; `group` is left out when counting the chips. */
function matches(event: AuditEvent, filter: AuditFilter, withGroup = true): boolean {
  if (filter.since && event.at < filter.since) return false
  if (filter.actorId && event.actorId !== filter.actorId) return false
  if (filter.recordType && event.record?.type !== filter.recordType) return false
  if (filter.result && event.result !== filter.result) return false
  if (withGroup && filter.group && event.group !== filter.group) return false
  const q = filter.q?.trim().toLowerCase()
  if (!q) return true
  const text = [event.actorName, event.record?.name, event.record?.id, event.ip, event.device, event.requestId, event.detail, `#${event.seq}`, ...event.changes.flatMap((c) => [c.field, c.from, c.to])]
  return text.some((t) => t?.toLowerCase().includes(q))
}

/**
 * Bursts of `min` or more entries within 10 minutes, per key, found by a window that slides one entry at a time; a
 * burst's entries aren't counted again in the next one.
 */
function bursts(events: AuditEvent[], keyOf: (e: AuditEvent) => string | null, min = 3) {
  const byKey = new Map<string, AuditEvent[]>()
  for (const e of events) {
    const key = keyOf(e)
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), e])
  }
  const out: { key: string; list: AuditEvent[] }[] = []
  for (const [key, list] of byKey) {
    for (let i = 0; i < list.length; ) {
      let j = i
      while (j + 1 < list.length && Date.parse(list[j + 1].at) - Date.parse(list[i].at) <= 10 * MINUTE) j++
      if (j - i + 1 >= min) {
        out.push({ key, list: list.slice(i, j + 1) })
        i = j + 1
      } else i++
    }
  }
  return out
}

const minutes = (list: AuditEvent[]) => Math.max(1, Math.round((Date.parse(list.at(-1)!.at) - Date.parse(list[0].at)) / MINUTE))

/** What in the last 7 days is worth a look (spec: the CRM's "Needs a look"), newest first, at most 10. */
export function needsALook(events: AuditEvent[], now: Date): AuditAlert[] {
  const recent = events.filter((e) => Date.parse(e.at) >= now.getTime() - WEEK)
  const alerts: AuditAlert[] = []
  for (const { list } of bursts(recent.filter((e) => e.action === 'signInFailed'), (e) => e.ip)) {
    const last = list.at(-1)!
    const names = [...new Set(list.map((e) => e.actorName))]
    alerts.push({ tone: 'red', at: last.at, seq: last.seq, text: `${list.length} failed sign-ins for ${names.length === 1 ? names[0] : `${names.length} accounts`} from ${last.ip} in ${minutes(list)} minutes` })
  }
  for (const { list } of bursts(recent.filter((e) => e.action === 'denied'), (e) => e.actorId)) {
    const last = list.at(-1)!
    alerts.push({ tone: 'red', at: last.at, seq: last.seq, text: `${last.actorName} was refused ${list.length} times in ${minutes(list)} minutes` })
  }
  for (const e of recent) {
    const first = e.changes[0]
    const more = e.changes.length > 1 ? ` and ${e.changes.length - 1} more` : ''
    const change = first ? `${first.field} ${first.from ?? '—'} → ${first.to ?? '—'}${more}` : ''
    if (e.record?.type === 'role' && e.result === 'done') {
      const text =
        e.action === 'created' ? `${e.actorName} added the role ${e.record.name}` : e.action === 'deleted' ? `${e.actorName} deleted the role ${e.record.name}` : `${e.actorName} changed roles and permissions: ${e.record.name}: ${change}`
      alerts.push({ tone: 'amber', at: e.at, seq: e.seq, text })
    } else if (e.record?.type === 'user' && e.changes.some((c) => c.field === 'Roles')) {
      const roles = e.changes.find((c) => c.field === 'Roles')!
      alerts.push({ tone: 'amber', at: e.at, seq: e.seq, text: `${e.actorName} changed ${e.record.name}’s roles: ${roles.from ?? '—'} → ${roles.to ?? '—'}` })
    } else if (e.action === 'exported' && e.record?.type === 'data') {
      alerts.push({ tone: 'amber', at: e.at, seq: e.seq, text: `${e.actorName} exported all the demo data` })
    }
  }
  return alerts.sort((a, b) => b.seq - a.seq).slice(0, 10)
}

/** The log as CSV, newest first, one line per entry; formulas stay text and Excel reads the BOM as UTF-8 (`toCsv`). */
export function auditCsv(events: AuditEvent[]): string {
  const head = ['#', 'When (UTC)', 'Who', 'Roles', 'Action', 'Group', 'Record type', 'Record', 'Changes', 'Result', 'Detail', 'IP', 'Device', 'Request', 'Hash', 'Previous hash']
  const rows = events.map((e) => [
    e.seq, e.at, e.actorName, e.actorRoles, e.action, e.group, e.record?.type ?? '', e.record?.name ?? '',
    e.changes.map((c) => `${c.field}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join('; '), e.result, e.detail ?? '', e.ip ?? '', e.device ?? '', e.requestId, e.hash, e.prevHash,
  ])
  return toCsv([head, ...rows])
}

/** The audit log's reads, its export, and the two things the prototype's pages report (slice 2). */
export function auditApi(db: MockDb, now: () => Date = () => new Date()): Api['audit'] {
  const requireView = (data: DbData) => {
    const me = currentUser(data)
    if (!can('audit.view', { userId: me.id, grants: grantsFor(data, me) })) throw forbidden('the audit log')
  }
  const filtered = (data: DbData, filter: AuditFilter) => data.audit.filter((e) => matches(e, filter)).reverse()
  return {
    async list(filter, cursor) {
      await delay()
      const data = await db.read()
      requireView(data)
      const before = cursor ? Number(cursor) : Infinity
      if (cursor && !Number.isFinite(before)) throw badRequest("That page doesn’t exist.")
      const all = filtered(data, filter).filter((e) => e.seq < before)
      const items = all.slice(0, PAGE)
      const pool = data.audit.filter((e) => matches(e, filter, false))
      const counts = Object.fromEntries([['all', pool.length], ...GROUPS.map((g) => [g, pool.filter((e) => e.group === g).length])]) as Record<'all' | AuditGroup, number>
      return clone({ items, nextCursor: all.length > PAGE ? String(items.at(-1)!.seq) : null, counts })
    },
    async get(seq) {
      await delay()
      const data = await db.read()
      requireView(data)
      const event = data.audit.find((e) => e.seq === seq)
      if (!event) throw notFound('Audit entry', String(seq))
      return clone(event)
    },
    async summary(todayFrom) {
      await delay()
      const data = await db.read()
      requireView(data)
      const today = data.audit.filter((e) => e.at >= todayFrom)
      const people = new Map<string, string>()
      for (const e of data.audit) if (e.actorId) people.set(e.actorId, e.actorName)
      const types = [...new Set(data.audit.map((e) => e.record?.type).filter((t): t is string => Boolean(t)))]
      return clone({
        today: {
          events: today.length,
          data: today.filter((e) => e.group === 'data').length,
          signIns: today.filter((e) => e.action === 'signedIn').length,
          failedSignIns: today.filter((e) => e.action === 'signInFailed').length,
          denied: today.filter((e) => e.action === 'denied').length,
        },
        needsALook: needsALook(data.audit, now()),
        chain: verifyChain(data.audit),
        people: [...people].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        recordTypes: types.map((id) => ({ id, label: RECORD_TYPES[id] ?? id })).sort((a, b) => a.label.localeCompare(b.label)),
      })
    },
    async export(filter) {
      await delay()
      return db.update((data) => {
        requireView(data)
        const events = filtered(data, filter)
        const csv = auditCsv(events)
        // Taking the log away is itself in the log.
        audit(data, { action: 'exported', group: 'exports', record: { type: 'auditLog', id: 'audit', name: 'Audit log' }, detail: `${events.length} ${events.length === 1 ? 'entry' : 'entries'}` })
        return csv
      })
    },
    async noteDownload(fileId) {
      await delay()
      await db.update((data) => {
        const file = visibleFile(data, fileId)
        audit(data, { action: 'downloaded', group: 'exports', record: recordOf.file({ id: file.id, title: file.title, name: file.name }) })
      })
    },
    async noteExport(what, detail) {
      await delay()
      if (what !== 'timeCost') throw badRequest("That report doesn’t exist.")
      await db.update((data) => {
        const me = currentUser(data)
        if (!can('timeCost.view', { userId: me.id, grants: grantsFor(data, me) })) throw forbidden('time and cost')
        audit(data, { action: 'exported', group: 'exports', record: { type: 'report', id: 'timeCost', name: 'Time and cost' }, detail: String(detail).slice(0, 120) || null })
      })
    },
  }
}
