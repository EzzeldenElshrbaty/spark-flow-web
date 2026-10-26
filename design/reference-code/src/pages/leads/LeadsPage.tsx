import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlarmClock, CalendarClock, CircleDashed, Hourglass, Inbox, Plus, Search, SlidersHorizontal, TimerOff, X, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { DataTable, TableSkeleton, type Column } from '../../components/ui/DataTable'
import { inputClass, selectClass } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { SortSelect } from '../../components/ui/SortSelect'
import { pageSizes } from '../../components/ui/styles'
import { timeAgo } from '../../lib/format'
import { isOpen, slaBreached, waitingTooLong } from '../../lib/leadRules'
import { columnSortFrom, sortParams, type ColumnSort } from '../../lib/sorting'
import { useMarket } from '../../lib/useMarket'
import { useViewer } from '../../lib/useRole'
import { channels, howHeardOptions, primaryContact, repWorksIn, reps, type LeadStatus } from '../../mocks/leads'
import { canAssignLeads, isLeadManager, leadFlags, leadSorts, leadTabs, leadsApi, type LeadFlag, type LeadQuery, type LeadRow, type LeadSort, type LeadTab } from '../../api/leads'
import { AssignDialog } from './dialogs'
import { NewLeadSheet } from './NewLeadSheet'
import { useServices } from './useServices'
import { LastUpdateLine } from '../followUps/shared'
import { Avatar, ChannelLabel, LeadStatusBadge, NextActionChip, ServiceChips } from './shared'

const tabLabels: Record<LeadTab, string> = { all: 'All', unassigned: 'Unassigned', later: 'Not now', disqualified: 'Disqualified' }
const sortLabels: Record<LeadSort, string> = { priority: 'Needs attention first', newest: 'Newest first', oldest: 'Oldest first' }
const flagInfo: Record<LeadFlag, { label: string; icon: LucideIcon; tone: string }> = {
  overdue: { label: 'Overdue', icon: AlarmClock, tone: 'text-red-600 dark:text-red-400' },
  sla: { label: 'SLA breach', icon: TimerOff, tone: 'text-red-600 dark:text-red-400' },
  waiting: { label: 'Waiting for salesperson', icon: Hourglass, tone: 'text-amber-600 dark:text-amber-400' },
  today: { label: 'Due today', icon: CalendarClock, tone: 'text-sky-600 dark:text-sky-400' },
  nonext: { label: 'No next step', icon: CircleDashed, tone: 'text-amber-600 dark:text-amber-400' },
}
const statusOptions: LeadStatus[] = ['New', 'Assigned', 'Contacted', 'Meeting held', 'Qualified']

/** Filter keys kept in the URL, with how each is labelled in the active-filter pills. */
const filterKeys = [
  { key: 'status', label: 'Status' },
  { key: 'service', label: 'Service' },
  { key: 'source', label: 'Source' },
  { key: 'channel', label: 'Channel' },
  { key: 'heard', label: 'Heard via' },
  { key: 'rep', label: 'Salesperson' },
] as const

const emptyText: Record<LeadTab, string> = {
  all: 'No leads match. Try another search or clear the filters.',
  unassigned: 'Nothing waiting. Every lead has a salesperson.',
  later: 'No leads parked for later.',
  disqualified: 'No disqualified leads.',
}

const oneOf = <T extends string>(value: string | null, options: readonly T[], fallback: T) => (options.includes(value as T) ? (value as T) : fallback)

export function LeadsPage() {
  const viewer = useViewer()
  const { scope } = useMarket()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const manager = isLeadManager(viewer.role)
  const [assigning, setAssigning] = useState<LeadRow | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // The URL holds the list state, so refresh and back/forward keep the same view.
  const visibleTabs = leadTabs.filter((tab) => tab !== 'unassigned' || manager)
  const tab = oneOf(params.get('tab'), visibleTabs, 'all')
  const query: LeadQuery = {
    tab,
    search: params.get('q') ?? '',
    status: (params.get('status') ?? '') as LeadQuery['status'],
    sourceType: (params.get('source') ?? '') as LeadQuery['sourceType'],
    channel: params.get('channel') ?? '',
    howHeard: params.get('heard') ?? '',
    service: params.get('service') ?? '',
    repId: params.get('rep') ?? '',
    flag: oneOf<LeadFlag | ''>(params.get('flag'), ['', ...leadFlags], ''),
    sort: oneOf(params.get('sort'), leadSorts, tab === 'unassigned' ? 'oldest' : 'priority'),
    orderBy: columnSortFrom(params),
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: Number(oneOf(params.get('size'), pageSizes.map(String), '20')),
  }

  /** Update URL params; changing anything other than the page goes back to page 1. */
  const update = (changes: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: !('page' in changes) && !('tab' in changes) })
  }

  // Search is typed locally and sent to the server 300ms after typing stops. When the URL changes
  // some other way (Back, a link), the box follows it instead of overwriting it.
  const [searchText, setSearchText] = useState(query.search)
  const [typing, setTyping] = useState(false)
  const [urlSearch, setUrlSearch] = useState(query.search)
  if (urlSearch !== query.search) {
    setUrlSearch(query.search)
    if (!typing) setSearchText(query.search)
  }
  useEffect(() => {
    if (!typing) return
    const timer = setTimeout(() => {
      setTyping(false)
      if (searchText.trim() !== query.search) update({ q: searchText.trim() || null })
    }, 300)
    return () => clearTimeout(timer)
  })

  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['leads', 'list', viewer.role, scope, query],
    queryFn: () => leadsApi.list(viewer, scope, query),
    placeholderData: keepPreviousData,
  })

  const activeFilters = filterKeys.filter(({ key }) => params.get(key))
  const services = useServices()
  /** What a filter pill shows: names rather than ids for reps and services. */
  const filterValueLabel = (key: string, value: string) => {
    if (key === 'rep') return value === 'none' ? 'Unassigned' : (reps.find((rep) => rep.id === value)?.name ?? value)
    if (key === 'service') return services.find((service) => service.id === value)?.name ?? value
    return value
  }
  const subtitle = viewer.role === 'Lead Intake' ? 'Leads you added.' : viewer.repId ? 'Your leads.' : 'New enquiries, the unassigned queue and qualification.'
  const visibleFlags = leadFlags.filter((flag) => flag !== 'waiting' || manager)
  const canAssign = canAssignLeads(viewer.role)

  const columns: Column<LeadRow>[] = [
    { id: 'lead', header: 'Lead', width: 205, minWidth: 180, sort: 'text', cell: (lead) => <LeadCell lead={lead} /> },
    {
      id: 'status',
      header: 'Status',
      width: 110,
      minWidth: 100,
      sort: 'order',
      cell: (lead) => (
        <span className="flex flex-col items-start gap-0.5">
          <LeadStatusBadge lead={lead} />
          {slaBreached(lead) && <span className="text-[11px] font-medium text-red-600 dark:text-red-400">SLA breach</span>}
        </span>
      ),
    },
    { id: 'services', header: 'Services', width: 145, minWidth: 110, sort: 'text', cell: (lead) => <ServiceChips services={lead.services} /> },
    { id: 'channel', header: 'Channel', width: 115, minWidth: 100, sort: 'text', cell: (lead) => <ChannelLabel channel={lead.channel} className="max-w-full text-fg-tertiary" /> },
    {
      id: 'rep',
      header: 'Salesperson',
      width: 125,
      minWidth: 110,
      sort: 'text',
      cell: (lead) =>
        lead.repName ? (
          <span className="flex min-w-0 items-center gap-2 text-fg-secondary">
            <Avatar name={lead.repName} size="sm" />
            <span className="truncate">{lead.repName}</span>
          </span>
        ) : canAssign && isOpen(lead) ? (
          <Button
            variant="secondary"
            className="py-1 text-xs"
            onClick={(event) => {
              event.stopPropagation()
              setAssigning(lead)
            }}
          >
            Assign
          </Button>
        ) : (
          <span className="text-fg-muted">Unassigned</span>
        ),
    },
    { id: 'next', header: 'Next step', width: 170, minWidth: 140, sort: 'date', cell: (lead) => <NextActionChip lead={lead} /> },
    { id: 'update', header: 'Last update', width: 220, minWidth: 140, sort: 'date', cell: (lead) => <LastUpdateLine event={lead.lastUpdate} /> },
    {
      id: 'created',
      header: tab === 'unassigned' ? 'Waiting' : 'Created',
      width: 95,
      minWidth: 90,
      align: 'right',
      sort: 'date',
      cell: (lead) => <span className={clsx('text-xs tabular-nums', waitingTooLong(lead) ? 'font-semibold text-red-600 dark:text-red-400' : 'text-fg-muted')}>{timeAgo(lead.createdAt)}</span>,
    },
  ]

  const sortDefaults = leadSorts.map((sort) => ({ value: sort, label: sortLabels[sort] }))
  /** A column sort, or back to one of the list's own orders. */
  const changeSort = (sort: ColumnSort | null, preset?: string) => update({ ...sortParams(sort), ...(preset !== undefined && { sort: preset }) })

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={subtitle}
        actions={
          <Button onClick={() => update({ new: '1', page: params.get('page') })}>
            <Plus className="size-4" /> New lead
          </Button>
        }
      />

      {/* Needs-attention summary. Each tile filters the list; click again to clear. */}
      <div className={clsx('mb-5 grid grid-cols-2 gap-3', visibleFlags.length === 5 ? 'sm:grid-cols-3 lg:grid-cols-5' : 'lg:grid-cols-4')}>
        {visibleFlags.map((flag) => {
          const info = flagInfo[flag]
          const active = query.flag === flag
          return (
            <button
              key={flag}
              type="button"
              aria-pressed={active}
              onClick={() => update({ flag: active ? null : flag, tab: null })}
              className={clsx(
                'flex items-center gap-3 rounded-xl border bg-surface p-3 text-left shadow-sm transition-all duration-200 hover:shadow-md motion-safe:hover:-translate-y-0.5 sm:p-4',
                active ? 'border-brand-500 ring-2 ring-accent-soft' : 'border-line hover:border-line-strong',
              )}
            >
              <span className={clsx('rounded-lg bg-surface-muted p-2', info.tone)}>
                <info.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-semibold tabular-nums text-fg">{data?.flagCounts[flag] ?? '–'}</span>
                <span className="block truncate text-xs text-fg-muted">{info.label}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Controls stay pinned under the top bar while the list scrolls. */}
      <div className="sticky top-16 z-10 -mx-4 mb-3 bg-canvas/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-6 md:px-6 xl:-mx-8 xl:px-8">
        <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
          {visibleTabs.map((item) => {
            const active = tab === item
            const alert = item === 'unassigned' && (data?.flagCounts.waiting ?? 0) > 0
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => update({ tab: item === 'all' ? null : item, sort: null })}
                className={clsx(
                  'relative flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                  "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-200 after:content-['']",
                  active ? 'text-fg after:scale-x-100' : 'text-fg-muted after:scale-x-0 hover:text-fg',
                )}
              >
                {tabLabels[item]}
                <span className={clsx('rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums', alert ? 'bg-brand-500 font-semibold text-white' : 'bg-surface-muted text-fg-tertiary')}>
                  {data?.tabCounts[item] ?? '–'}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value)
                setTyping(true)
              }}
              placeholder="Search name, company, phone, email"
              className={clsx(inputClass, 'pl-9')}
              aria-label="Search leads"
            />
          </label>
          <div className="hidden w-56 shrink-0 md:block">
            <SortSelect columns={columns} sort={query.orderBy ?? null} onChange={changeSort} defaults={sortDefaults} defaultValue={query.sort} />
          </div>
          <Button variant="secondary" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters} className="shrink-0">
            <SlidersHorizontal className="size-4" />
            <span className="max-sm:sr-only">Filters</span>
            {activeFilters.length > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">{activeFilters.length}</span>}
          </Button>
        </div>

        {showFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2 motion-safe:animate-fade-in sm:grid-cols-3 lg:grid-cols-6">
            <FilterSelect label="Status" value={params.get('status') ?? ''} onChange={(value) => update({ status: value })} options={statusOptions} />
            <FilterSelect
              label="Service"
              value={params.get('service') ?? ''}
              onChange={(value) => update({ service: value })}
              options={services.filter((service) => service.active).map((service) => ({ value: service.id, label: service.name }))}
            />
            <FilterSelect label="Source" value={params.get('source') ?? ''} onChange={(value) => update({ source: value })} options={['Inbound', 'Outbound']} />
            <FilterSelect label="Channel" value={params.get('channel') ?? ''} onChange={(value) => update({ channel: value })} options={[...channels]} />
            <FilterSelect label="Heard via" value={params.get('heard') ?? ''} onChange={(value) => update({ heard: value })} options={[...howHeardOptions]} />
            {!viewer.repId && (
              <FilterSelect
                label="Salesperson"
                value={params.get('rep') ?? ''}
                onChange={(value) => update({ rep: value })}
                options={[{ value: 'none', label: 'Unassigned' }, ...reps.filter((rep) => scope === 'all' || repWorksIn(rep, scope)).map((rep) => ({ value: rep.id, label: rep.name }))]}
              />
            )}
            <SortSelect columns={columns} sort={query.orderBy ?? null} onChange={changeSort} defaults={sortDefaults} defaultValue={query.sort} className="py-1.5 md:hidden" />
          </div>
        )}

        {(activeFilters.length > 0 || query.flag) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {query.flag && <FilterPill label={flagInfo[query.flag].label} onRemove={() => update({ flag: null })} />}
            {activeFilters.map(({ key, label }) => (
              <FilterPill key={key} label={`${label}: ${filterValueLabel(key, params.get(key)!)}`} onRemove={() => update({ [key]: null })} />
            ))}
            <button
              type="button"
              onClick={() => update(Object.fromEntries([...filterKeys.map(({ key }) => [key, null]), ['flag', null]]))}
              className="px-1.5 text-xs font-medium text-accent hover:text-accent-strong"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {!data ? (
        <TableSkeleton />
      ) : data.items.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
          <span className="rounded-full bg-accent-soft p-3 text-accent">
            <Inbox className="size-6" />
          </span>
          <p className="mt-3 text-sm text-fg-muted">{query.search ? `Nothing matches "${query.search}".` : emptyText[tab]}</p>
        </div>
      ) : (
        <div className={clsx('transition-opacity duration-200', isPlaceholderData && isFetching && 'opacity-60')} aria-busy={isFetching}>
          {/* Tablets and desktops: the table. Phones: compact rows, since a table can't fit 360px. */}
          <div className="hidden sm:block">
            <DataTable
              label="Leads"
              columns={columns}
              rows={data.items}
              rowKey={(lead) => lead.id}
              onRowClick={(lead) => navigate(`/leads/${lead.id}`)}
              sort={query.orderBy}
              onSort={(sort) => update(sortParams(sort))}
              storageKey="spark-crm.leads.columns"
              animateKey={`${data.page}-${tab}-${query.flag}-${query.search}-${query.sort}-${params.get('by')}-${params.get('dir')}`}
            />
          </div>
          <ul key={`${data.page}-${tab}-${query.flag}-${query.search}-${query.sort}-${params.get('by')}-${params.get('dir')}`} className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface sm:hidden">
            {data.items.map((lead, index) => (
              <li key={lead.id} className="motion-safe:animate-fade-in" style={{ animationDelay: `${Math.min(index, 12) * 20}ms` }}>
                <LeadListRow lead={lead} />
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            pageCount={data.pageCount}
            pageSize={data.pageSize}
            total={data.total}
            onPage={(page) => update({ page: page === 1 ? null : page })}
            onPageSize={(size) => update({ size: size === 20 ? null : size })}
          />
        </div>
      )}

      <NewLeadSheet open={params.get('new') === '1'} onClose={() => update({ new: null, page: params.get('page') })} />
      {assigning && <AssignDialog lead={assigning} onClose={() => setAssigning(null)} />}
    </>
  )
}

function LeadCell({ lead }: { lead: LeadRow }) {
  const contact = primaryContact(lead)
  const others = lead.contacts.length - 1
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={contact.name} />
      <div className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <Link to={`/leads/${lead.id}`} onClick={(event) => event.stopPropagation()} className="truncate font-medium text-fg hover:underline">
            {contact.name}
          </Link>
          {others > 0 && (
            <span className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-fg-tertiary" title={`${others} more contact${others > 1 ? 's' : ''}`}>
              +{others}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-fg-muted">{[contact.jobTitle, lead.company].filter(Boolean).join(' · ') || '—'}</span>
      </div>
    </div>
  )
}

/** Phones: one compact row per lead. */
function LeadListRow({ lead }: { lead: LeadRow }) {
  const contact = primaryContact(lead)
  const others = lead.contacts.length - 1
  return (
    <Link to={`/leads/${lead.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-surface-sunken">
      <Avatar name={contact.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium text-fg">{contact.name}</span>
              {others > 0 && <span className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-fg-tertiary">+{others}</span>}
            </span>
            <span className="block truncate text-xs text-fg-muted">{lead.company || contact.jobTitle || '—'}</span>
          </span>
          <LeadStatusBadge lead={lead} />
        </div>
        <LastUpdateLine event={lead.lastUpdate} className="mt-1" />
        <div className="mt-2 flex items-center justify-between gap-2">
          <NextActionChip lead={lead} compact />
          <span className={clsx('shrink-0 text-[11px] tabular-nums', waitingTooLong(lead) ? 'font-semibold text-red-600 dark:text-red-400' : 'text-fg-muted')}>{timeAgo(lead.createdAt)}</span>
        </div>
      </div>
    </Link>
  )
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent motion-safe:animate-fade-in">
      {label}
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-black/5 dark:hover:bg-white/10" aria-label={`Remove ${label}`}>
        <X className="size-3" />
      </button>
    </span>
  )
}

type Option = string | { value: string; label: string }

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Option[] }) {
  return (
    <select className={clsx(selectClass, 'py-1.5', !value && 'text-fg-muted')} value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
      <option value="">{label}: any</option>
      {options.map((option) => {
        const item = typeof option === 'string' ? { value: option, label: option } : option
        return (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        )
      })}
    </select>
  )
}
