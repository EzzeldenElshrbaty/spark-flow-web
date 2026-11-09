import clsx from 'clsx'
import { ArrowLeft, Ban, CalendarClock, Download, Inbox, LogIn, PenLine, Search, ShieldAlert, ShieldCheck, ShieldX, X, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAuditEntry, useAuditLog, useAuditSummary, useExportAudit } from '@/api/audit'
import type { AuditAlert, AuditEvent, AuditFilter, AuditGroup, AuditSummary } from '@/api/types'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, TableSkeleton, type Column } from '@/components/ui/DataTable'
import { inputClass, selectClass } from '@/components/ui/Field'
import { NoAccess } from '@/components/ui/NoAccess'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { Sheet } from '@/components/ui/Sheet'
import { downloadCsv } from '@/lib/csv'
import { localDay } from '@/lib/dates'
import { formatWhen, timeAgo } from '@/lib/format'
import { paths } from '@/lib/paths'
import { useAccess } from '@/lib/usePermission'
import { ACTIONS, breakHere, chainText, changeLine, changeSummary, dayStart, filterFrom, GROUPS, groupLabel, PERIODS, RESULTS } from './auditView'

const SEARCH_WAIT_MS = 300

/**
 * Settings → Audit log (Admin and help, slice 2, as the CRM's): who did what to which record, when and from where.
 * Today's counts and the tamper check up top, what needs a look, then the log, newest first, filtered from the
 * address. A row opens the entry with its field changes and its place in the chain. Nobody can change an entry.
 */
export function AuditLogPage() {
  const { ws = '' } = useParams()
  const access = useAccess('audit.view')
  const back = (
    <Link to={paths.settings(ws)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4 rtl:-scale-x-100" /> Settings
    </Link>
  )
  if (access === 'denied') {
    return (
      <>
        {back}
        <PageHeader title="Audit log" />
        <NoAccess ws={ws} what="the audit log" />
      </>
    )
  }
  return (
    <>
      {back}
      <AuditLog ready={access === 'allowed'} />
    </>
  )
}

function AuditLog({ ready }: { ready: boolean }) {
  const [params, setParams] = useSearchParams()
  const now = new Date()
  const todayFrom = dayStart(now)
  const filter = filterFrom(params, now)
  const summary = useAuditSummary(todayFrom, ready)
  const log = useAuditLog(filter, ready)
  const exportLog = useExportAudit()
  const entryParam = Number(params.get('entry'))
  const openSeq = Number.isInteger(entryParam) && entryParam > 0 ? entryParam : null

  const set = (values: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )
  const open = (seq: number) => set({ entry: String(seq) })

  const exportCsv = () =>
    exportLog.mutate(filter, {
      onSuccess: (csv) => downloadCsv(`audit-log-${localDay(now)}.csv`, csv),
    })

  const items = log.data?.pages.flatMap((p) => p.items) ?? []
  const counts = log.data?.pages[0]?.counts
  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Who did what, when and from where. Entries can't be changed or removed."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={!ready || exportLog.isPending}>
            <Download className="size-4" />
            <span className="max-sm:sr-only">{exportLog.isPending ? 'Exporting…' : 'Export CSV'}</span>
          </Button>
        }
      />
      {exportLog.isError && (
        <p role="alert" className="-mt-3 mb-4 text-sm text-red-700 dark:text-red-300">
          The export didn't work. Try again.
        </p>
      )}
      <Tiles summary={summary.data} failed={summary.isError} onOpen={open} />
      <NeedsALook summary={summary.data} failed={summary.isError} onRetry={() => void summary.refetch()} onOpen={open} />
      <Controls params={params} set={set} summary={summary.data} counts={counts} />
      {log.isError && !log.data ? (
        <QueryError what="the audit log" onRetry={() => void log.refetch()} />
      ) : !log.data ? (
        <div aria-busy="true">
          <TableSkeleton rows={8} />
        </div>
      ) : items.length === 0 ? (
        <Empty filtered={hasFilter(filter)} onClear={() => set({ q: '', period: '', person: '', type: '', result: '', group: '' })} />
      ) : (
        <div className={clsx('transition-opacity', log.isPlaceholderData && 'opacity-60')}>
          <Table items={items} types={summary.data?.recordTypes} onOpen={open} />
          <List items={items} types={summary.data?.recordTypes} onOpen={open} />
          {log.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
                {log.isFetchingNextPage ? 'Loading…' : 'Show more'}
              </Button>
            </div>
          )}
        </div>
      )}
      <EntrySheet seq={ready ? openSeq : null} summary={summary.data} loaded={items} types={summary.data?.recordTypes} onClose={() => set({ entry: '' })} />
    </>
  )
}

const hasFilter = (f: AuditFilter) => Boolean(f.q || f.since || f.actorId || f.recordType || f.result || f.group)

// ── The top: today's counts and the tamper check ───────────────────────────────

function Tile({ icon: Icon, label, value, note, tone }: { icon: LucideIcon; label: string; value: ReactNode; note?: ReactNode; tone: string }) {
  return (
    <li className="min-w-0 rounded-xl border border-line bg-surface p-3 shadow-sm sm:p-4">
      <span className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
        <span aria-hidden className={clsx('shrink-0 rounded-md p-1', tone)}>
          <Icon className="size-3.5" />
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-2 block text-xl font-semibold tabular-nums text-fg">{value}</span>
      {note && <span className="block text-xs text-fg-muted">{note}</span>}
    </li>
  )
}

const TONE = {
  neutral: 'bg-surface-muted text-fg-secondary',
  accent: 'bg-accent-soft text-accent',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
}

function Tiles({ summary, failed, onOpen }: { summary?: AuditSummary; failed: boolean; onOpen: (seq: number) => void }) {
  const count = (n: number | undefined) => (n === undefined ? (failed ? '—' : <span aria-hidden className="mt-1 block h-6 w-8 animate-pulse rounded bg-surface-strong" />) : n)
  const today = summary?.today
  const chain = summary ? chainText(summary.chain) : null
  return (
    <ul aria-label="Today" className="m-0 mb-6 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 xl:grid-cols-6">
      <Tile icon={CalendarClock} label="Events today" value={count(today?.events)} tone={TONE.neutral} />
      <Tile icon={PenLine} label="Data changes" value={count(today?.data)} tone={TONE.accent} />
      <Tile icon={LogIn} label="Sign-ins" value={count(today?.signIns)} tone={TONE.neutral} />
      <Tile icon={ShieldAlert} label="Failed sign-ins" value={count(today?.failedSignIns)} tone={today?.failedSignIns ? TONE.red : TONE.neutral} />
      <Tile icon={Ban} label="Access denied" value={count(today?.denied)} tone={today?.denied ? TONE.amber : TONE.neutral} />
      <Tile
        icon={chain && !chain.ok ? ShieldX : ShieldCheck}
        label="Tamper check"
        tone={!chain ? TONE.neutral : chain.ok ? TONE.green : TONE.red}
        value={chain ? <span className={chain.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>{chain.value}</span> : count(undefined)}
        note={
          summary && !summary.chain.intact ? (
            <button type="button" onClick={() => onOpen(brokenAt(summary))} className="text-start font-medium text-accent hover:text-accent-strong">
              {chain?.note}
            </button>
          ) : (
            chain?.note
          )
        }
      />
    </ul>
  )
}

/** Where the chain breaks; 0 when it doesn't. */
const brokenAt = (summary: AuditSummary) => (summary.chain.intact ? 0 : summary.chain.brokenAt)

// ── Needs a look ─────────────────────────────────────────────────────────────

function NeedsALook({ summary, failed, onRetry, onOpen }: { summary?: AuditSummary; failed: boolean; onRetry: () => void; onOpen: (seq: number) => void }) {
  const id = useId()
  const alerts = summary?.needsALook
  return (
    <section aria-labelledby={id} className="mb-6 rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex items-baseline justify-between gap-3 border-b border-line-subtle px-4 py-3 sm:px-5">
        <h2 id={id} className="text-base font-medium text-fg">
          Needs a look
        </h2>
        <span className="text-xs text-fg-muted">Last 7 days</span>
      </div>
      {failed && !alerts ? (
        <div className="px-4 py-3 sm:px-5">
          <QueryError what="what needs a look" onRetry={onRetry} />
        </div>
      ) : !alerts ? (
        <div aria-hidden className="space-y-3 px-4 py-4 sm:px-5">
          <span className="block h-3 w-2/3 animate-pulse rounded bg-surface-strong" />
          <span className="block h-3 w-1/2 animate-pulse rounded bg-surface-muted" />
        </div>
      ) : alerts.length === 0 ? (
        <p className="px-4 py-4 text-sm text-fg-muted sm:px-5">Nothing in the last 7 days.</p>
      ) : (
        <ul className="m-0 list-none divide-y divide-line-subtle p-0">
          {alerts.map((alert) => (
            <li key={`${alert.seq}-${alert.text}`}>
              <AlertRow alert={alert} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AlertRow({ alert, onOpen }: { alert: AuditAlert; onOpen: (seq: number) => void }) {
  return (
    <button type="button" onClick={() => onOpen(alert.seq)} className="flex min-h-11 w-full items-start gap-3 px-4 py-2.5 text-start hover:bg-surface-sunken sm:px-5">
      <span aria-hidden className={clsx('mt-1.5 size-2 shrink-0 rounded-full', alert.tone === 'red' ? 'bg-red-500' : 'bg-amber-500')} />
      <span className="min-w-0 flex-1 text-sm text-fg">
        <span className="sr-only">{alert.tone === 'red' ? 'Urgent: ' : 'Worth a look: '}</span>
        {alert.text}
      </span>
      <span className="shrink-0 text-xs text-fg-muted tabular-nums">{timeAgo(alert.at)}</span>
    </button>
  )
}

// ── Filters ──────────────────────────────────────────────────────────────────

function Controls({ params, set, summary, counts }: { params: URLSearchParams; set: (values: Record<string, string>) => void; summary?: AuditSummary; counts?: Record<'all' | AuditGroup, number> }) {
  const group = params.get('group') ?? ''
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  const sent = useRef(urlQ)
  // The address follows the box after a pause; Back (or Clear) puts the address's words back in the box, but the
  // words this box just sent don't overwrite what was typed since.
  useEffect(() => {
    if (urlQ !== sent.current) setQ(urlQ)
    sent.current = urlQ
  }, [urlQ])
  useEffect(() => {
    if (q === urlQ) return
    const timer = setTimeout(() => {
      sent.current = q
      set({ q })
    }, SEARCH_WAIT_MS)
    return () => clearTimeout(timer)
  })
  const chip = (id: string, label: string, count: number | undefined) => (
    <button
      key={id || 'all'}
      type="button"
      aria-pressed={group === id}
      onClick={() => set({ group: id })}
      className={clsx(
        'relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
        "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-200 after:content-['']",
        group === id ? 'text-fg after:scale-x-100' : 'text-fg-muted after:scale-x-0 hover:text-fg',
      )}
    >
      {label}
      <span className="rounded-full bg-surface-muted px-1.5 text-xs tabular-nums text-fg-secondary">{count ?? '–'}</span>
    </button>
  )
  const select = (key: string, label: string, options: { id: string; label: string }[], any: string) => (
    <select className={clsx(selectClass, 'min-w-0')} aria-label={label} value={params.get(key) ?? ''} onChange={(e) => set({ [key]: e.target.value })}>
      <option value="">{any}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
  return (
    <div className="sticky top-16 z-10 -mx-4 mb-3 bg-canvas/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-6 md:px-6 xl:-mx-8 xl:px-8">
      <div role="group" aria-label="Kind of entry" className="mb-3 flex gap-1 overflow-x-auto border-b border-line">
        {chip('', 'All', counts?.all)}
        {GROUPS.map((g) => chip(g.id, g.label, counts?.[g.id]))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
        <label className="relative col-span-2 sm:col-span-3 lg:col-span-1">
          <span className="sr-only">Search the log</span>
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
          <input type="search" className={clsx(inputClass, 'ps-9')} placeholder="Search names, records, IPs, #341…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {select('period', 'Period', PERIODS.filter((p) => p.id).map((p) => ({ id: p.id, label: p.label })), 'Any time')}
        {select('person', 'Person', summary?.people.map((p) => ({ id: p.id, label: p.name })) ?? [], 'Anyone')}
        {select('type', 'Record type', summary?.recordTypes ?? [], 'Any record')}
        {select('result', 'Result', Object.entries(RESULTS).map(([id, r]) => ({ id, label: r.label })), 'Any result')}
      </div>
    </div>
  )
}

function Empty({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
      <span className="rounded-full bg-accent-soft p-3 text-accent">
        <Inbox className="size-6" />
      </span>
      <p className="mt-3 text-sm text-fg-muted">{filtered ? 'Nothing in the log matches.' : 'Nothing has been recorded yet.'}</p>
      {filtered && (
        <button type="button" onClick={onClear} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent">
          <X className="size-3.5" /> Clear search and filters
        </button>
      )}
    </div>
  )
}

// ── The log ──────────────────────────────────────────────────────────────────

type Types = AuditSummary['recordTypes'] | undefined
const typeLabel = (types: Types, id: string) => types?.find((t) => t.id === id)?.label ?? id

function Who({ event }: { event: AuditEvent }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={event.actorName} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-fg">{event.actorName}</span>
        {event.actorRoles && <span className="block truncate text-xs text-fg-muted">{event.actorRoles}</span>}
      </span>
    </span>
  )
}

function RecordCell({ event, types }: { event: AuditEvent; types: Types }) {
  if (!event.record) return <span className="text-fg-muted">—</span>
  return (
    <span className="block min-w-0">
      <span className="block truncate text-fg">{event.record.name}</span>
      <span className="block truncate text-xs text-fg-muted">{typeLabel(types, event.record.type)}</span>
    </span>
  )
}

function Table({ items, types, onOpen }: { items: AuditEvent[]; types: Types; onOpen: (seq: number) => void }) {
  const columns: Column<AuditEvent>[] = [
    {
      id: 'seq',
      header: '#',
      width: 64,
      cell: (e) => (
        <button
          type="button"
          onClick={(click) => {
            click.stopPropagation()
            onOpen(e.seq)
          }}
          className="font-mono text-xs text-fg-secondary hover:text-accent" aria-label={`Open entry ${e.seq}`}>
          #{e.seq}
        </button>
      ),
    },
    { id: 'when', header: 'When', width: 156, cell: (e) => <time dateTime={e.at} className="whitespace-nowrap text-fg-secondary tabular-nums">{formatWhen(e.at)}</time> },
    { id: 'who', header: 'Who', width: 176, cell: (e) => <Who event={e} /> },
    {
      id: 'action',
      header: 'Action',
      width: 140,
      // The result shows only when it isn't Done; most entries are.
      cell: (e) => (
        <span className="block whitespace-nowrap">
          <Badge tone={ACTIONS[e.action].tone}>{ACTIONS[e.action].label}</Badge>
          {e.result !== 'done' && <span className="mt-0.5 block text-xs text-red-700 dark:text-red-300">{RESULTS[e.result].label}</span>}
        </span>
      ),
    },
    { id: 'record', header: 'Record', width: 180, cell: (e) => <RecordCell event={e} types={types} /> },
    { id: 'changes', header: 'Changes', width: 256, cell: (e) => <span className="block truncate text-fg-secondary" title={changeSummary(e)}>{changeSummary(e)}</span> },
    { id: 'ip', header: 'IP', width: 136, cell: (e) => <span className="font-mono text-xs text-fg-secondary">{e.ip ?? '—'}</span> },
  ]
  return (
    <div className="max-md:hidden">
      <DataTable columns={columns} rows={items} rowKey={(e) => String(e.seq)} onRowClick={(e) => onOpen(e.seq)} storageKey="spark-flow.table.audit" label="Audit log" />
    </div>
  )
}

function List({ items, types, onOpen }: { items: AuditEvent[]; types: Types; onOpen: (seq: number) => void }) {
  return (
    <ul aria-label="Audit log" className="m-0 list-none divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface p-0 md:hidden">
      {items.map((e, i) => (
        <li key={e.seq} className="motion-safe:animate-fade-in" style={{ animationDelay: `${Math.min(i, 15) * 20}ms` }}>
          <button type="button" onClick={() => onOpen(e.seq)} className="flex w-full flex-col gap-1 px-4 py-3 text-start active:bg-surface-sunken">
            <span className="flex w-full min-w-0 items-center gap-2">
              <Badge tone={ACTIONS[e.action].tone}>{ACTIONS[e.action].label}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{e.record?.name ?? groupLabel(e.group)}</span>
              <span className="shrink-0 font-mono text-xs text-fg-muted">#{e.seq}</span>
            </span>
            <span className="truncate text-xs text-fg-muted">
              {e.actorName} · <time dateTime={e.at}>{formatWhen(e.at)}</time>
              {e.record && ` · ${typeLabel(types, e.record.type)}`}
              {e.result !== 'done' && ` · ${RESULTS[e.result].label}`}
            </span>
            <span className="truncate text-sm text-fg-secondary">{changeSummary(e)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── One entry ────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="m-0 min-w-0 text-fg">{children}</dd>
    </div>
  )
}

function EntrySheet({ seq, summary, loaded, types, onClose }: { seq: number | null; summary?: AuditSummary; loaded: AuditEvent[]; types: Types; onClose: () => void }) {
  // An entry on screen opens at once; one from a link or Needs a look is fetched by its number.
  const shown = loaded.find((e) => e.seq === seq)
  const fetched = useAuditEntry(seq, seq !== null && !shown)
  const event = shown ?? fetched.data
  const broken = event ? breakHere(summary?.chain, event.seq) : null
  return (
    <Sheet
      open={seq !== null}
      onClose={onClose}
      variant="drawer"
      dismissible
      focusFirstField={false}
      title={event ? `#${event.seq} · ${ACTIONS[event.action].label}` : `Entry #${seq}`}
      description={event ? `${formatWhen(event.at)} · ${groupLabel(event.group)}` : undefined}
    >
      {!event ? (
        fetched.isError ? (
          <p role="alert" className="text-sm text-fg-muted">
            {(fetched.error as { status?: number }).status === 404 ? `There's no entry #${seq}.` : "This entry didn't load."}
          </p>
        ) : (
          <div aria-busy="true" className="h-64 animate-pulse rounded-xl bg-surface-muted" />
        )
      ) : (
        <>
          {broken && (
            <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/15 dark:text-red-300">
              {broken}
            </p>
          )}
          <dl className="m-0 divide-y divide-line-subtle">
            <Row label="Who">
              <span className="block">{event.actorName}</span>
              {event.actorRoles && <span className="block text-xs text-fg-muted">{event.actorRoles}</span>}
            </Row>
            <Row label="Record">
              {event.record ? (
                <>
                  <span className="block break-words">{event.record.name}</span>
                  <span className="block text-xs text-fg-muted">
                    {typeLabel(types, event.record.type)} · <span className="font-mono">{event.record.id}</span>
                  </span>
                </>
              ) : (
                '—'
              )}
            </Row>
            <Row label="Result">
              <Badge tone={RESULTS[event.result].tone}>{RESULTS[event.result].label}</Badge>
              {event.detail && <span className="mt-1 block break-words text-fg-secondary">{event.detail}</span>}
            </Row>
            <Row label="IP">
              <span className="font-mono text-xs">{event.ip ?? '—'}</span>
            </Row>
            <Row label="Device">{event.device ?? '—'}</Row>
            <Row label="Request">
              <span className="break-all font-mono text-xs">{event.requestId}</span>
            </Row>
          </dl>
          {event.changes.length > 0 && (
            <section className="mt-5">
              <h3 className="mb-2 text-sm font-medium text-fg">Changes</h3>
              <table className="w-full table-fixed border-collapse text-sm" aria-label="Changes">
                <thead>
                  <tr className="border-b border-line text-xs text-fg-muted">
                    <th scope="col" className="w-1/3 py-1.5 pe-2 text-start font-medium">Field</th>
                    <th scope="col" className="py-1.5 pe-2 text-start font-medium">Before</th>
                    <th scope="col" className="py-1.5 text-start font-medium">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {event.changes.map((c, i) => (
                    <tr key={i} title={changeLine(c)}>
                      <td className="break-words py-2 pe-2 align-top text-fg-secondary">{c.field}</td>
                      <td className="break-words py-2 pe-2 align-top text-fg-muted">{c.from ?? '—'}</td>
                      <td className="break-words py-2 align-top text-fg">{c.to ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <section className="mt-5 rounded-lg bg-surface-sunken p-3">
            <h3 className="mb-1 text-sm font-medium text-fg">Chain</h3>
            <p className="mb-2 text-xs text-fg-muted">Each entry holds the hash of the one before it, so changing or removing an entry breaks the chain from there.</p>
            <dl className="m-0 space-y-2 text-xs">
              <div>
                <dt className="text-fg-muted">Previous hash</dt>
                <dd className="m-0 break-all font-mono text-fg-secondary">{event.prevHash}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">This entry’s hash</dt>
                <dd className="m-0 break-all font-mono text-fg-secondary">{event.hash}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </Sheet>
  )
}
