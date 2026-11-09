import clsx from 'clsx'
import { ArrowLeft, Inbox, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useArchived, useDeleteForGood, useSetRetention } from '@/api/archived'
import { useRestoreChannel } from '@/api/chat'
import { useRestoreProject } from '@/api/projects'
import { useRestoreTask } from '@/api/tickets'
import type { ArchivedRecord, User } from '@/api/types'
import { useUsers } from '@/api/users'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, TableSkeleton, type Column } from '@/components/ui/DataTable'
import { Field, inputClass } from '@/components/ui/Field'
import { NoAccess } from '@/components/ui/NoAccess'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatDate } from '@/lib/format'
import { paths } from '@/lib/paths'
import { useAccess } from '@/lib/usePermission'
import { deletableText, filterArchived, goesWithParts, TYPES, typeLabel } from './archivedView'

const SEARCH_WAIT_MS = 300

/**
 * Settings → Archived records (Admin and help, slice 4, as the CRM's): every archived project, task and channel in the
 * workspace, why and by whom, and whether it may be deleted for good. Restore follows each type's own rights; delete
 * for good asks first, names what goes with it, and never takes logged time or a channel.
 */
export function ArchivedPage() {
  const { ws = '' } = useParams()
  const access = useAccess('archive.manage')
  const back = (
    <Link to={paths.settings(ws)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4 rtl:-scale-x-100" /> Settings
    </Link>
  )
  if (access === 'denied') {
    return (
      <>
        {back}
        <PageHeader title="Archived records" />
        <NoAccess ws={ws} what="archived records" />
      </>
    )
  }
  return (
    <>
      {back}
      <Archived ready={access === 'allowed'} />
    </>
  )
}

function Archived({ ready }: { ready: boolean }) {
  const { ws = '' } = useParams()
  const { workspace } = useCurrentWorkspace()
  const [params, setParams] = useSearchParams()
  const archived = useArchived(workspace?.id, ready)
  const people = useUsers(workspace?.id).data ?? []
  const [deleting, setDeleting] = useState<ArchivedRecord | null>(null)
  const [retention, setRetention] = useState(false)
  const now = new Date()
  const type = params.get('type') ?? ''
  const items = archived.data?.items ?? []
  const shown = filterArchived(items, params.get('q') ?? '', type)
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

  return (
    <>
      <PageHeader title="Archived records" subtitle="Archived projects, tasks and channels: why, by whom, and when they can be deleted for good." />
      {archived.data && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-sm">
          <p className="m-0 min-w-0 flex-1 text-fg-secondary">
            Kept for <span className="font-medium text-fg tabular-nums">{archived.data.retentionDays} days</span> after archiving, then they can be deleted
            for good. Anything with time logged on it is always kept, and channels are restored only.
          </p>
          <Button variant="secondary" onClick={() => setRetention(true)}>
            Change
          </Button>
        </div>
      )}
      <Controls params={params} set={set} counts={items} />
      {archived.isError ? (
        <QueryError what="archived records" onRetry={() => void archived.refetch()} />
      ) : !archived.data ? (
        <div aria-busy="true">
          <TableSkeleton rows={6} />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
          <span className="rounded-full bg-accent-soft p-3 text-accent">
            <Inbox className="size-6" />
          </span>
          <p className="mt-3 text-sm text-fg-muted">{items.length ? 'Nothing archived matches.' : 'Nothing is archived.'}</p>
          {items.length > 0 && (
            <button type="button" onClick={() => set({ q: '', type: '' })} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent">
              <X className="size-3.5" /> Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <>
          <Table items={shown} people={people} ws={ws} now={now} onDelete={setDeleting} />
          <List items={shown} people={people} ws={ws} now={now} onDelete={setDeleting} />
        </>
      )}
      {deleting && <DeleteSheet record={deleting} onClose={() => setDeleting(null)} />}
      {retention && archived.data && <RetentionSheet days={archived.data.retentionDays} onClose={() => setRetention(false)} />}
    </>
  )
}

// ── Filters ──────────────────────────────────────────────────────────────────

function Controls({ params, set, counts }: { params: URLSearchParams; set: (values: Record<string, string>) => void; counts: ArchivedRecord[] }) {
  const type = params.get('type') ?? ''
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  const sent = useRef(urlQ)
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
  const chip = (id: string, label: string, count: number) => (
    <button
      key={id || 'all'}
      type="button"
      aria-pressed={type === id}
      onClick={() => set({ type: id })}
      className={clsx(
        'relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors',
        "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-200 after:content-['']",
        type === id ? 'text-fg after:scale-x-100' : 'text-fg-muted after:scale-x-0 hover:text-fg',
      )}
    >
      {label}
      <span className="rounded-full bg-surface-muted px-1.5 text-xs tabular-nums text-fg-secondary">{count}</span>
    </button>
  )
  return (
    <div className="mb-3">
      <div role="group" aria-label="Kind of record" className="mb-3 flex gap-1 overflow-x-auto border-b border-line">
        {chip('', 'All', counts.length)}
        {TYPES.map((t) => chip(t.id, t.label, counts.filter((r) => r.type === t.id).length))}
      </div>
      <label className="relative block">
        <span className="sr-only">Search archived records</span>
        <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
        <input type="search" className={clsx(inputClass, 'ps-9')} placeholder="Search names, keys and reasons…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
    </div>
  )
}

// ── The list ─────────────────────────────────────────────────────────────────

type RowProps = { items: ArchivedRecord[]; people: User[]; ws: string; now: Date; onDelete: (r: ArchivedRecord) => void }

/** Where a record opens: its project, or its project with the task open; a channel's own page. */
function hrefOf(r: ArchivedRecord, ws: string) {
  if (r.type === 'project') return paths.project(ws, r.ref)
  if (r.type === 'task') return `${paths.project(ws, r.ref.split('-')[0]!, 'tasks')}?ticket=${encodeURIComponent(r.ref)}`
  return paths.channel(ws, r.id)
}

const byWhom = (r: ArchivedRecord, people: User[]) => (r.archivedBy ? people.find((p) => p.id === r.archivedBy)?.name : undefined)

/** Restore, with the type's own call and rights; a refusal is said beside it. */
function RestoreButton({ record }: { record: ArchivedRecord }) {
  const project = useRestoreProject()
  const task = useRestoreTask()
  const channel = useRestoreChannel()
  const run = record.type === 'project' ? project : record.type === 'task' ? task : channel
  const restore = () => (record.type === 'project' ? project.mutate(record.id) : record.type === 'task' ? task.mutate(record.id) : channel.mutate(record.id))
  if (record.restoreBlocked) return <span className="max-w-56 text-end text-xs text-fg-muted">{record.restoreBlocked}</span>
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="secondary" className="min-h-11 sm:min-h-0" onClick={restore} disabled={run.isPending} aria-label={`Restore ${record.name}`}>
        {run.isPending ? 'Restoring…' : 'Restore'}
      </Button>
      {run.isError && (
        <span role="alert" className="max-w-56 text-end text-xs text-red-700 dark:text-red-300">
          {run.error.message}
        </span>
      )}
    </span>
  )
}

function Actions({ record, now, onDelete }: { record: ArchivedRecord; now: Date; onDelete: (r: ArchivedRecord) => void }) {
  return (
    <span className="flex flex-wrap items-start justify-end gap-2">
      <RestoreButton record={record} />
      {deletableText(record, now).now && (
        <Button variant="ghost" className="min-h-11 text-red-700 hover:text-red-800 sm:min-h-0 dark:text-red-300 dark:hover:text-red-200" onClick={() => onDelete(record)} aria-label={`Delete ${record.name} for good`}>
          Delete…
        </Button>
      )}
    </span>
  )
}

function Table({ items, people, ws, now, onDelete }: RowProps) {
  const columns: Column<ArchivedRecord>[] = [
    {
      id: 'record',
      header: 'Record',
      width: 250,
      cell: (r) => (
        <Link to={hrefOf(r, ws)} className="block min-w-0 hover:underline">
          <span className="block truncate font-medium text-fg">{r.name}</span>
          {r.type !== 'channel' && <span className="block truncate font-mono text-xs text-fg-muted">{r.ref}</span>}
        </Link>
      ),
    },
    { id: 'type', header: 'Type', width: 100, cell: (r) => <Badge>{typeLabel(r.type)}</Badge> },
    {
      id: 'archived',
      header: 'Archived',
      width: 170,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block text-fg-secondary tabular-nums">{formatDate(r.archivedAt)}</span>
          <span className="block truncate text-xs text-fg-muted">{byWhom(r, people) ?? '—'}</span>
        </span>
      ),
    },
    { id: 'why', header: 'Why', width: 220, cell: (r) => <span className="block truncate text-fg-secondary" title={r.reason ?? undefined}>{r.reason ?? '—'}</span> },
    { id: 'deletable', header: 'Can be deleted', width: 190, cell: (r) => <span className="block truncate text-fg-secondary">{deletableText(r, now).text}</span> },
    { id: 'actions', header: 'Actions', width: 190, align: 'right', cell: (r) => <Actions record={r} now={now} onDelete={onDelete} /> },
  ]
  return (
    <div className="max-md:hidden">
      <DataTable columns={columns} rows={items} rowKey={(r) => `${r.type}:${r.id}`} storageKey="spark-flow.table.archived" label="Archived records" />
    </div>
  )
}

function List({ items, people, ws, now, onDelete }: RowProps) {
  return (
    <ul aria-label="Archived records" className="m-0 list-none divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface p-0 md:hidden">
      {items.map((r) => (
        <li key={`${r.type}:${r.id}`} className="flex flex-col gap-2 px-4 py-3">
          <span className="flex min-w-0 items-center gap-2">
            <Badge>{typeLabel(r.type)}</Badge>
            <Link to={hrefOf(r, ws)} className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
              {r.name}
            </Link>
          </span>
          <span className="text-xs text-fg-muted">
            Archived {formatDate(r.archivedAt)}
            {byWhom(r, people) && ` by ${byWhom(r, people)}`} · {deletableText(r, now).text}
          </span>
          {r.reason && <span className="text-sm text-fg-secondary">{r.reason}</span>}
          <Actions record={r} now={now} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  )
}

// ── Delete for good, and how long they're kept ──────────────────────────────

/** Delete for good: the record's key (or the channel's name) is typed first, so it never happens by a slip (UX Phase 1, 1.4). */
function DeleteSheet({ record, onClose }: { record: ArchivedRecord; onClose: () => void }) {
  const remove = useDeleteForGood()
  const parts = goesWithParts(record)
  return (
    <DeleteDialog
      title={`Delete ${record.name} for good?`}
      description={
        record.type === 'project'
          ? 'Its channel stays, archived, and can still be restored. The audit log keeps a line saying it was deleted.'
          : 'The audit log keeps a line saying it was deleted.'
      }
      confirmText={record.ref}
      removes={parts.length ? parts : ['Nothing else goes with it.']}
      onDelete={() => remove.mutateAsync({ type: record.type, id: record.id }).then(onClose)}
      onClose={onClose}
    />
  )
}

function RetentionSheet({ days, onClose }: { days: number; onClose: () => void }) {
  const save = useSetRetention()
  const [value, setValue] = useState(String(days))
  return (
    <Sheet
      open
      onClose={onClose}
      dirty={value !== String(days)}
      title="Keep archived records"
      description="How many days after archiving a record can be deleted for good."
      footer={
        <>
          <SheetCancelButton />
          <Button onClick={() => save.mutate(Number(value), { onSuccess: onClose })} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(Number(value), { onSuccess: onClose })
        }}
      >
        <Field label="Days" hint="Between 30 and 3650. Time logged and channels are always kept." error={save.error?.message}>
          <input className={inputClass} inputMode="numeric" value={value} aria-invalid={save.isError} onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))} />
        </Field>
      </form>
    </Sheet>
  )
}
