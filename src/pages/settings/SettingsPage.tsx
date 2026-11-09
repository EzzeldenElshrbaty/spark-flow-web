import clsx from 'clsx'
import { Archive, ChevronRight, Clock, Database, ScrollText, ShieldCheck, Users, Wallet, type LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useTeams } from '@/api/projects'
import { useRoles } from '@/api/roles'
import { useUsers } from '@/api/users'
import { PageHeader } from '@/components/ui/PageHeader'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { backendOn } from '@/lib/api'
import { paths } from '@/lib/paths'
import { usePermission } from '@/lib/usePermission'

type Tone = 'accent' | 'amber'
const tiles: Record<Tone, string> = {
  accent: 'bg-accent-soft text-accent',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
}
// Decoration only, so neither red nor amber (UX Phase 3, 3.3: red means act or late).
const marks: Record<Tone, string> = { accent: 'bg-fg-subtle', amber: 'bg-fg-subtle' }

type Entry = { to: string; icon: LucideIcon; title: string; about: string; chips?: string[] }

/** One setting, as the CRM's: an icon tile, its name and what it's for, a few facts, and a chevron to open it. */
function SettingCard({ entry, tone }: { entry: Entry; tone: Tone }) {
  const Icon = entry.icon
  return (
    <Link to={entry.to} className="flex items-start gap-4 rounded-xl border border-line bg-surface p-5 shadow-sm transition-colors hover:border-line-strong hover:bg-surface-sunken">
      <span className={clsx('grid size-11 shrink-0 place-items-center rounded-xl', tiles[tone])}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-fg">{entry.title}</span>
        <span className="mt-0.5 block text-sm text-fg-muted">{entry.about}</span>
        {entry.chips && entry.chips.length > 0 && (
          <span className="mt-2.5 flex flex-wrap gap-1.5">
            {entry.chips.map((chip) => (
              <span key={chip} className="rounded-md bg-surface-muted px-2 py-0.5 text-xs text-fg-secondary tabular-nums">
                {chip}
              </span>
            ))}
          </span>
        )}
      </span>
      <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-muted rtl:-scale-x-100" />
    </Link>
  )
}

function Group({ title, tone, children }: { title: string; tone: Tone; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="mb-3 flex items-center gap-2.5 text-base font-medium text-fg">
        <span aria-hidden className={clsx('size-2 rotate-45 rounded-[2px]', marks[tone])} />
        {title}
      </h2>
      <div className="grid gap-3 lg:grid-cols-2">{children}</div>
    </section>
  )
}

/**
 * Settings (slice 1, as the CRM's): a few counts, then what can be changed, grouped. Each card shows only to whoever
 * may open its page.
 */
export function SettingsPage() {
  const { ws = '' } = useParams()
  const { workspace } = useCurrentWorkspace()
  const check = usePermission()
  const peopleQuery = useUsers(workspace?.id)
  const rolesQuery = useRoles()
  const teamsQuery = useTeams(workspace?.id)
  const roles = rolesQuery.data

  const people = peopleQuery.data
  const off = people?.filter((p) => p.deactivated).length ?? 0
  const access: Entry[] = [
    ...(check('settings.manage')
      ? [{ to: paths.users(ws), icon: Users, title: 'Users', about: 'Who works here: their roles, teams and whether they’re active', chips: people ? [`${people.length - off} active`, ...(off ? [`${off} deactivated`] : [])] : [] }]
      : []),
    ...(check('settings.manage') ? [{ to: paths.roles(ws), icon: ShieldCheck, title: 'Roles and permissions', about: 'What each role may do', chips: roles ? [`${roles.length} roles`] : [] }] : []),
    ...(check('audit.view') ? [{ to: paths.audit(ws), icon: ScrollText, title: 'Audit log', about: 'Who did what, when and from where' }] : []),
    ...(check('checkins.view') ? [{ to: paths.attendance(ws), icon: Clock, title: 'Attendance', about: 'Days from timers, where they started from, time using Flow, and working hours' }] : []),
  ]
  const data: Entry[] = [
    ...(check('archive.manage') ? [{ to: paths.archived(ws), icon: Archive, title: 'Archived records', about: 'Archived projects, tasks and channels: restore, or delete for good' }] : []),
    ...(check('rates.view') ? [{ to: paths.rates(ws), icon: Wallet, title: 'Hourly cost', about: 'What each person costs per hour, for project cost' }] : []),
    // The demo data only exists in the prototype; with the backend on there is no Database page.
    ...(!backendOn && check('database.manage')
      ? [{ to: paths.database(ws), icon: Database, title: 'Database', about: 'Export, reload or reset the demo data in this browser', chips: ['Prototype'] }]
      : []),
  ]

  return (
    <>
      <PageHeader title="Settings" subtitle="How Spark Flow works for everyone" />
      <ul aria-label="At a glance" className="m-0 grid list-none grid-cols-3 gap-3 p-0">
        {(
          [
            // Each count opens its page (UX Phase 2, 2.4, 2.8): Users and Roles for whoever may change them, Teams for all.
            ['People', peopleQuery, check('settings.manage') ? paths.users(ws) : null],
            ['Roles', rolesQuery, check('settings.manage') ? paths.roles(ws) : null],
            ['Teams', teamsQuery, paths.teams(ws)],
          ] as const
        ).map(([label, query, to]) => {
          const body = (
            <>
              <span className="block text-xs text-fg-muted sm:text-sm">{label}</span>
              {/* A pulse while it loads; "—" only when it couldn't be counted. */}
              {query.data ? (
                <span className="mt-1 block text-2xl font-semibold tracking-tight text-fg tabular-nums">{query.data.length}</span>
              ) : query.isError ? (
                <span className="mt-1 block text-2xl font-semibold tracking-tight text-fg-muted">—</span>
              ) : (
                <span aria-hidden className="mt-1 block h-8 w-10 animate-pulse rounded-md bg-surface-strong" />
              )}
            </>
          )
          const tile = 'block rounded-xl border border-line bg-surface px-4 py-3 shadow-sm sm:px-5 sm:py-4'
          return (
            <li key={label}>
              {to ? (
                <Link to={to} className={`${tile} transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500`}>
                  {body}
                </Link>
              ) : (
                <div className={tile}>{body}</div>
              )}
            </li>
          )
        })}
      </ul>
      {access.length === 0 && data.length === 0 && <p className="mt-8 text-sm text-fg-muted">Nothing to set up here yet.</p>}
      {access.length > 0 && (
        <Group title="People and access" tone="accent">
          {access.map((entry) => (
            <SettingCard key={entry.to} entry={entry} tone="accent" />
          ))}
        </Group>
      )}
      {data.length > 0 && (
        <Group title="Data" tone="amber">
          {data.map((entry) => (
            <SettingCard key={entry.to} entry={entry} tone="amber" />
          ))}
        </Group>
      )}
    </>
  )
}
