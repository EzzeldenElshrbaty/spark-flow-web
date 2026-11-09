import clsx from 'clsx'
import { ArrowLeft, Inbox, Plus, RotateCcw, Search, UserX, Users as UsersIcon, Wallet, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useTeams } from '@/api/projects'
import { useRoles } from '@/api/roles'
import type { NewPerson, PersonRow, Role, Team } from '@/api/types'
import { useCreatePerson, useDeactivatePerson, useDirectory, useMe, useReactivatePerson, useUpdatePerson } from '@/api/users'
import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, TableSkeleton, type Column } from '@/components/ui/DataTable'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { NoAccess } from '@/components/ui/NoAccess'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatDate, timeAgo } from '@/lib/format'
import { paths } from '@/lib/paths'
import { useAccess, usePermission } from '@/lib/usePermission'
import { fieldOf, filterPeople, roleNames, teamNames, usersFilterFrom } from './usersView'
import { quietChange } from '@/lib/searchParams'

const SEARCH_WAIT_MS = 300
const MAX_REASON = 200

/**
 * Settings → Users (Admin and help, slice 3): everyone in the company, with their roles, teams, when they last did
 * anything and whether they're active. Add person and Edit share one sheet; Deactivate asks for an optional reason.
 * Sign-in, invitations and passwords wait for the backend (spec §10): a new person can be tried through View as.
 */
export function UsersPage() {
  const { ws = '' } = useParams()
  const access = useAccess('settings.manage')
  const back = (
    <Link to={paths.settings(ws)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4 rtl:-scale-x-100" /> Settings
    </Link>
  )
  if (access === 'denied') {
    return (
      <>
        {back}
        <PageHeader title="Users" />
        <NoAccess ws={ws} what="users" />
      </>
    )
  }
  return (
    <>
      {back}
      <Users ready={access === 'allowed'} />
    </>
  )
}

function Users({ ready }: { ready: boolean }) {
  const { workspace } = useCurrentWorkspace()
  const [params, setParams] = useSearchParams()
  const directory = useDirectory(ready)
  const rolesQuery = useRoles()
  const teamsQuery = useTeams(workspace?.id)
  const roles = rolesQuery.data ?? []
  const teams = teamsQuery.data ?? []
  // The sheet starts from the roles and teams it shows: it opens once they're here, so a team still loading isn't
  // read as one they're off.
  const formReady = Boolean(rolesQuery.data && teamsQuery.data)
  const [deactivating, setDeactivating] = useState<PersonRow | null>(null)
  const filter = usersFilterFrom(params)
  const people = directory.data ?? []
  const shown = filterPeople(people, filter)
  const opened = params.get('person')
  const editing = opened && opened !== 'new' ? people.find((p) => p.id === opened) : undefined

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
      // Typing in search, or closing a person, isn't a step; other choices are (UX Phase 2, 2.7).
      { replace: quietChange(values, { typed: ['q'], sheets: ['person'] }) },
    )
  const open = (id: string) => set({ person: id })

  const active = people.filter((p) => !p.deactivated).length
  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Everyone at the company: their roles, their teams, and who is active."
        actions={
          <Button onClick={() => open('new')} disabled={!ready}>
            <Plus className="size-4" />
            <span className="max-sm:sr-only">Add person</span>
          </Button>
        }
      />
      <Controls params={params} set={set} roles={roles} teams={teams} />
      {directory.data && (
        <p className="mb-3 text-sm text-fg-muted tabular-nums">
          {active} active{people.length > active && ` · ${people.length - active} deactivated`}
          {shown.length !== people.length && ` · ${shown.length} shown`}
        </p>
      )}
      {directory.isError ? (
        <QueryError what="the people list" onRetry={() => void directory.refetch()} />
      ) : !directory.data ? (
        <div aria-busy="true">
          <TableSkeleton rows={8} />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
          <span className="rounded-full bg-accent-soft p-3 text-accent">
            <Inbox className="size-6" />
          </span>
          <p className="mt-3 text-sm text-fg-muted">Nobody matches.</p>
          <button type="button" onClick={() => set({ q: '', role: '', team: '', status: '' })} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent">
            <X className="size-3.5" /> Clear search and filters
          </button>
        </div>
      ) : (
        <>
          <Table people={shown} roles={roles} teams={teams} onOpen={open} />
          <List people={shown} roles={roles} onOpen={open} />
        </>
      )}
      {formReady && opened === 'new' && <PersonSheet roles={roles} teams={teams} onClose={() => set({ person: '' })} />}
      {formReady && editing && (
        <PersonSheet
          key={editing.id}
          person={editing}
          people={people}
          roles={roles}
          teams={teams}
          onClose={() => set({ person: '' })}
          onDeactivate={() => {
            setDeactivating(editing)
            set({ person: '' })
          }}
        />
      )}
      {deactivating && <DeactivateSheet person={deactivating} onClose={() => setDeactivating(null)} />}
    </>
  )
}

// ── Filters ──────────────────────────────────────────────────────────────────

function Controls({ params, set, roles, teams }: { params: URLSearchParams; set: (values: Record<string, string>) => void; roles: Role[]; teams: Team[] }) {
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(urlQ)
  const sent = useRef(urlQ)
  // The address follows the box after a pause; Back (or Clear) puts the address's words back in the box.
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
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
      <label className="relative col-span-2 sm:col-span-3 lg:col-span-1">
        <span className="sr-only">Search people</span>
        <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
        <input type="search" className={clsx(inputClass, 'ps-9')} placeholder="Search names, emails, titles…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {select('role', 'Role', roles.map((r) => ({ id: r.id, label: r.name })), 'Any role')}
      {select('team', 'Team', teams.map((t) => ({ id: t.id, label: t.name })), 'Any team')}
      <div className="col-span-2 sm:col-span-1">
        {select(
          'status',
          'Status',
          [
            { id: 'active', label: 'Active' },
            { id: 'deactivated', label: 'Deactivated' },
          ],
          'Any status',
        )}
      </div>
    </div>
  )
}

// ── The list ─────────────────────────────────────────────────────────────────

function StatusBadge({ person }: { person: PersonRow }) {
  if (!person.deactivated) return <Badge tone="success">Active</Badge>
  return <Badge tone="neutral">Deactivated</Badge>
}

const lastActive = (p: PersonRow) => (p.lastActiveAt ? timeAgo(p.lastActiveAt) : 'Never')

function Table({ people, roles, teams, onOpen }: { people: PersonRow[]; roles: Role[]; teams: Team[]; onOpen: (id: string) => void }) {
  const columns: Column<PersonRow>[] = [
    {
      id: 'name',
      header: 'Name',
      width: 260,
      // The name is the row's button for the keyboard; a click anywhere on the row opens the person too.
      cell: (p) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen(p.id)
          }}
          className="flex min-w-0 items-center gap-2.5 text-start"
        >
          <Avatar name={p.name} size={24} decorative />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">{p.name}</span>
            <span className="block truncate text-xs text-fg-muted">{p.title || '—'}</span>
          </span>
        </button>
      ),
    },
    { id: 'email', header: 'Email', width: 230, cell: (p) => <span className="block truncate text-fg-secondary">{p.email}</span> },
    { id: 'roles', header: 'Roles', width: 170, cell: (p) => <span className="block truncate text-fg-secondary">{roleNames(roles, p.roleIds)}</span> },
    { id: 'teams', header: 'Teams', width: 140, cell: (p) => <span className="block truncate text-fg-secondary">{teamNames(teams, p.teamIds)}</span> },
    { id: 'last', header: 'Last active', width: 120, cell: (p) => <span className="whitespace-nowrap text-fg-secondary tabular-nums">{lastActive(p)}</span> },
    { id: 'status', header: 'Status', width: 120, cell: (p) => <StatusBadge person={p} /> },
  ]
  return (
    <div className="max-md:hidden">
      <DataTable columns={columns} rows={people} rowKey={(p) => p.id} onRowClick={(p) => onOpen(p.id)} storageKey="spark-flow.table.users" label="People" />
    </div>
  )
}

function List({ people, roles, onOpen }: { people: PersonRow[]; roles: Role[]; onOpen: (id: string) => void }) {
  return (
    <ul aria-label="People" className="m-0 list-none divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface p-0 md:hidden">
      {people.map((p, i) => (
        <li key={p.id} className="motion-safe:animate-fade-in" style={{ animationDelay: `${Math.min(i, 15) * 20}ms` }}>
          <button type="button" onClick={() => onOpen(p.id)} className="flex w-full min-w-0 items-start gap-3 px-4 py-3 text-start active:bg-surface-sunken">
            <Avatar name={p.name} decorative />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-fg">{p.name}</span>
                {p.deactivated && <Badge tone="neutral">Deactivated</Badge>}
              </span>
              <span className="block truncate text-xs text-fg-muted">{p.email}</span>
              <span className="block truncate text-xs text-fg-muted">
                {roleNames(roles, p.roleIds)} · {lastActive(p)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// ── Add person and Edit ──────────────────────────────────────────────────────

/** Add person, or Edit someone: one form. Teams outside this workspace are kept as they are. */
function PersonSheet({
  person,
  people = [],
  roles,
  teams,
  onClose,
  onDeactivate,
}: {
  person?: PersonRow
  people?: PersonRow[]
  roles: Role[]
  teams: Team[]
  onClose: () => void
  onDeactivate?: () => void
}) {
  const { ws = '' } = useParams()
  const check = usePermission()
  const meId = useMe().data?.id
  const reactivate = useReactivatePerson()
  const create = useCreatePerson()
  const update = useUpdatePerson()
  const save = person ? update : create
  const [opened] = useState<NewPerson>(() => ({
    name: person?.name ?? '',
    email: person?.email ?? '',
    title: person?.title ?? '',
    roleIds: person?.roleIds ?? [],
    teamIds: person?.teamIds.filter((id) => teams.some((t) => t.id === id)) ?? [],
  }))
  const [values, setValues] = useState(opened)
  // Closing with changes asks first (UX Phase 1, 1.2).
  const dirty = JSON.stringify(values) !== JSON.stringify(opened)
  const [checked, setChecked] = useState<Partial<Record<keyof NewPerson, string>>>({})
  const set = <K extends keyof NewPerson>(key: K, value: NewPerson[K]) => setValues((v) => ({ ...v, [key]: value }))
  const toggle = (key: 'roleIds' | 'teamIds', id: string) => set(key, values[key].includes(id) ? values[key].filter((x) => x !== id) : [...values[key], id])
  const refused = save.error?.message ?? null
  const errorOf = (key: keyof NewPerson) => checked[key] ?? (refused && fieldOf(refused) === key ? refused : undefined)
  const deactivatedBy = person?.deactivated && people.find((p) => p.id === person.deactivated!.by)?.name

  const submit = () => {
    const missing: Partial<Record<keyof NewPerson, string>> = {}
    if (!values.name.trim()) missing.name = 'Give their name.'
    if (!values.email.trim()) missing.email = 'Give their email.'
    if (values.roleIds.length === 0) missing.roleIds = 'Give them at least one role.'
    setChecked(missing)
    if (Object.keys(missing).length) return
    // Teams in other workspaces aren't shown here, and stay.
    const elsewhere = person?.teamIds.filter((id) => !teams.some((t) => t.id === id)) ?? []
    // A team removed meanwhile (UX Phase 2, 2.4: teams can go) isn't sent: only this workspace's teams as they are now.
    const input = { ...values, teamIds: [...elsewhere, ...values.teamIds.filter((id) => teams.some((t) => t.id === id))] }
    if (person) update.mutate({ id: person.id, patch: input }, { onSuccess: onClose })
    else create.mutate(input, { onSuccess: onClose })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dirty={dirty}
      discardQuestion={person ? 'Discard your changes?' : 'Discard this new person?'}
      variant="drawer"
      // Edit opens from a row, often by a tap: the keyboard waits until a field is chosen.
      focusFirstField={!person}
      title={person ? `Edit ${person.name}` : 'Add person'}
      description={person ? undefined : 'They can be tried at once through View as. Sign-in and invitations come with the backend.'}
      footer={
        <>
          <SheetCancelButton />
          <Button onClick={submit} disabled={save.isPending}>
            {person ? (save.isPending ? 'Saving…' : 'Save changes') : save.isPending ? 'Adding…' : 'Add person'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {person?.deactivated && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-sunken px-3 py-2">
            <p className="m-0 min-w-0 flex-1 text-sm text-fg-secondary">
              Deactivated {formatDate(person.deactivated.at)}
              {deactivatedBy && ` by ${deactivatedBy}`}
              {person.deactivated.reason && ` · ${person.deactivated.reason}`}
            </p>
            <Button variant="secondary" onClick={() => reactivate.mutate(person.id, { onSuccess: onClose })} disabled={reactivate.isPending}>
              <RotateCcw className="size-4" /> {reactivate.isPending ? 'Reactivating…' : 'Reactivate'}
            </Button>
            {reactivate.isError && (
              <p role="alert" className="m-0 w-full text-sm text-red-600 dark:text-red-400">
                {reactivate.error.message || "Couldn't reactivate them. Try again."}
              </p>
            )}
          </div>
        )}
        <Field label="Name" required error={errorOf('name')}>
          <input className={inputClass} value={values.name} maxLength={80} autoComplete="off" aria-invalid={Boolean(errorOf('name'))} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Email" required error={errorOf('email')}>
          {/* Text with an email keyboard: the house sentence, not the browser's bubble, says what's wrong. */}
          <input inputMode="email" className={inputClass} value={values.email} autoComplete="off" spellCheck={false} aria-invalid={Boolean(errorOf('email'))} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Title" error={errorOf('title')}>
          <input className={inputClass} value={values.title} maxLength={80} placeholder="Frontend Engineer" aria-invalid={Boolean(errorOf('title'))} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <fieldset aria-describedby={errorOf('roleIds') ? 'person-roles-error' : undefined}>
          <legend className="mb-1.5 text-sm font-medium text-fg-secondary">
            Roles<span className="text-accent"> *</span>
          </legend>
          <div className="grid gap-1 rounded-lg border border-line p-2 sm:grid-cols-2">
            {roles.map((r) => (
              <label key={r.id} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-fg-secondary hover:bg-surface-muted">
                <input type="checkbox" checked={values.roleIds.includes(r.id)} onChange={() => toggle('roleIds', r.id)} className="accent-brand-500" />
                <span className="truncate">{r.name}</span>
              </label>
            ))}
          </div>
          {errorOf('roleIds') && (
            <span id="person-roles-error" className="mt-1 block text-xs text-red-600 dark:text-red-400">
              {errorOf('roleIds')}
            </span>
          )}
        </fieldset>
        {teams.length > 0 && (
          <fieldset aria-describedby={errorOf('teamIds') ? 'person-teams-error' : undefined}>
            <legend className="mb-1.5 text-sm font-medium text-fg-secondary">Teams</legend>
            <div className="grid gap-1 rounded-lg border border-line p-2 sm:grid-cols-2">
              {teams.map((t) => (
                <label key={t.id} className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-fg-secondary hover:bg-surface-muted">
                  <input type="checkbox" checked={values.teamIds.includes(t.id)} onChange={() => toggle('teamIds', t.id)} className="accent-brand-500" />
                  <span className="truncate">{t.name}</span>
                </label>
              ))}
            </div>
            {errorOf('teamIds') && (
              <span id="person-teams-error" className="mt-1 block text-xs text-red-600 dark:text-red-400">
                {errorOf('teamIds')}
              </span>
            )}
          </fieldset>
        )}
        {refused && !fieldOf(refused) && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {refused}
          </p>
        )}
        {/* Enter in a field saves, as the footer's button does. */}
        <button type="submit" hidden />
      </form>
      {person && (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-subtle pt-4 text-sm">
          {/* Teams are named on Teams, and hourly cost set on Hourly cost: Admins go there from here. */}
          <Link to={paths.teams(ws)} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:text-accent-strong">
            <UsersIcon className="size-4" /> Teams
          </Link>
          {check('rates.view') && (
            <Link to={paths.rates(ws)} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:text-accent-strong">
              <Wallet className="size-4" /> Hourly cost
            </Link>
          )}
          {!person.deactivated && person.id !== meId && onDeactivate && (
            <button type="button" onClick={onDeactivate} className="ms-auto inline-flex min-h-11 items-center gap-1.5 font-medium text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200">
              <UserX className="size-4" /> Deactivate…
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ── Deactivate ───────────────────────────────────────────────────────────────

function DeactivateSheet({ person, onClose }: { person: PersonRow; onClose: () => void }) {
  const deactivate = useDeactivatePerson()
  const [reason, setReason] = useState('')
  const close = () => {
    if (!deactivate.isPending) onClose()
  }
  return (
    <Sheet
      open
      onClose={close}
      title={`Deactivate ${person.name}?`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => deactivate.mutate({ id: person.id, reason }, { onSuccess: onClose })} disabled={deactivate.isPending}>
            {deactivate.isPending ? 'Deactivating…' : 'Deactivate'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="m-0 list-disc space-y-1 ps-5 text-sm text-fg-secondary">
          <li>They're signed out and leave every picker and View as.</li>
          <li>A timer they have running stops.</li>
          <li>Their work, time and messages stay. You can reactivate them later.</li>
        </ul>
        <Field label="Reason" hint={`Optional. Kept in the audit log. ${reason.length}/${MAX_REASON}`} error={deactivate.error?.message}>
          <textarea className={clsx(inputClass, 'min-h-20')} value={reason} maxLength={MAX_REASON} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  )
}
