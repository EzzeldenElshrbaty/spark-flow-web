import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Building2, Inbox, Mail, Phone, Plus, Search, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { DataTable, TableSkeleton, type Column } from '../../components/ui/DataTable'
import { inputClass, selectClass } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { SortSelect } from '../../components/ui/SortSelect'
import { pageSizes } from '../../components/ui/styles'
import { MarketIcon } from '../../layout/MarketSwitcher'
import { formatCompact } from '../../lib/format'
import { columnSortFrom, sortParams, type ColumnSort } from '../../lib/sorting'
import { useMarket } from '../../lib/useMarket'
import { useViewer } from '../../lib/useRole'
import { Button } from '../../components/ui/Button'
import { NewClientSheet } from './NewClientSheet'
import { canAddClients, clientSorts, clientTabs, clientsApi, type ClientRow, type ClientSort, type ClientTab, type ContactRow } from '../../api/clients'
import { repWorksIn, reps } from '../../mocks/leads'
import { LastUpdateLine } from '../followUps/shared'
import { Avatar } from '../leads/shared'
import { RelationshipBadge } from './shared'

type View = 'clients' | 'contacts'
const tabLabels: Record<ClientTab, string> = { all: 'All', client: 'Clients', prospect: 'Prospects', past: 'Past' }
const sortLabels: Record<ClientSort, string> = { recent: 'Most recent first', name: 'Name A to Z', value: 'Biggest value first' }
const emptyText: Record<ClientTab, string> = {
  all: 'No clients yet. A client appears when its first lead is added, or add one from before the CRM.',
  client: 'No clients with a won deal yet.',
  prospect: 'No open leads or deals.',
  past: 'No past clients.',
}

const oneOf = <T extends string>(value: string | null, options: readonly T[], fallback: T) => (options.includes(value as T) ? (value as T) : fallback)

export function ClientsPage() {
  const viewer = useViewer()
  const { scope } = useMarket()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  // The URL holds the list state, so refresh and back/forward keep the same view.
  const view = oneOf<View>(params.get('view'), ['clients', 'contacts'], 'clients')
  const tab = oneOf(params.get('tab'), clientTabs, 'all')
  const search = params.get('q') ?? ''
  const repId = params.get('rep') ?? ''
  const sort = oneOf(params.get('sort'), clientSorts, 'recent')
  const orderBy = columnSortFrom(params)
  const pageNumber = Math.max(1, Number(params.get('page')) || 1)
  const pageSize = Number(oneOf(params.get('size'), pageSizes.map(String), '20'))

  /** Update URL params; changing anything other than the page goes back to page 1. */
  const update = (changes: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: !('page' in changes) && !('tab' in changes) && !('view' in changes) })
  }

  // Search is sent to the server 300ms after typing stops; when the URL changes another way, the box follows it.
  const [searchText, setSearchText] = useState(search)
  const [typing, setTyping] = useState(false)
  const [urlSearch, setUrlSearch] = useState(search)
  if (urlSearch !== search) {
    setUrlSearch(search)
    if (!typing) setSearchText(search)
  }
  useEffect(() => {
    if (!typing) return
    const timer = setTimeout(() => {
      setTyping(false)
      if (searchText.trim() !== search) update({ q: searchText.trim() || null })
    }, 300)
    return () => clearTimeout(timer)
  })

  const clientQuery = { tab, search, repId, sort, orderBy, page: pageNumber, pageSize }
  const clients = useQuery({
    queryKey: ['clients', 'list', viewer.role, viewer.name, scope, clientQuery],
    queryFn: () => clientsApi.list(viewer, scope, clientQuery),
    placeholderData: keepPreviousData,
    enabled: view === 'clients',
  })
  const contactQuery = { search, repId, orderBy, page: pageNumber, pageSize }
  const contacts = useQuery({
    queryKey: ['clients', 'contacts', viewer.role, viewer.name, scope, contactQuery],
    queryFn: () => clientsApi.contacts(viewer, scope, contactQuery),
    placeholderData: keepPreviousData,
    enabled: view === 'contacts',
  })

  const currency = clients.data?.currency ?? 'EGP'
  const clientColumns: Column<ClientRow>[] = [
    {
      id: 'name',
      header: 'Client',
      width: 230,
      minWidth: 180,
      sort: 'text',
      cell: (client) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={client.name} />
          <div className="min-w-0">
            <Link to={`/clients/${client.id}`} onClick={(event) => event.stopPropagation()} className="block truncate font-medium text-fg hover:underline">
              {client.name}
            </Link>
            <span className="flex items-center gap-1 truncate text-xs text-fg-muted">
              {scope === 'all' && <MarketIcon scope={client.market} className="size-3 shrink-0" />}
              {client.country}
            </span>
          </div>
        </div>
      ),
    },
    { id: 'relationship', header: 'Status', width: 100, minWidth: 90, sort: 'order', cell: (client) => <RelationshipBadge relationship={client.relationship} /> },
    {
      id: 'contact',
      header: 'Main contact',
      width: 180,
      minWidth: 130,
      sort: 'text',
      cell: (client) =>
        client.mainContact ? (
          <span className="block min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-fg-secondary">{client.mainContact.name}</span>
              {client.contactCount > 1 && (
                <span className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-fg-tertiary" title={`${client.contactCount} contacts`}>
                  +{client.contactCount - 1}
                </span>
              )}
            </span>
            {client.mainContact.jobTitle && <span className="block truncate text-xs text-fg-muted">{client.mainContact.jobTitle}</span>}
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      id: 'deals',
      header: 'Open deals',
      width: 120,
      minWidth: 100,
      align: 'right',
      sort: 'number',
      cell: (client) =>
        client.openDeals ? (
          <span className="block text-right">
            <span className="block font-medium tabular-nums text-fg">{client.openValue ? formatCompact(client.openValue, currency) : 'Not priced'}</span>
            <span className="block text-xs text-fg-muted">
              {client.openDeals} deal{client.openDeals > 1 ? 's' : ''}
            </span>
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      id: 'value',
      header: 'Won',
      width: 105,
      minWidth: 90,
      align: 'right',
      sort: 'number',
      cell: (client) => (client.wonValue ? <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">{formatCompact(client.wonValue, currency)}</span> : <span className="text-fg-subtle">—</span>),
    },
    {
      id: 'rep',
      header: 'Salesperson',
      width: 140,
      minWidth: 110,
      sort: 'text',
      cell: (client) =>
        client.salespeople.length ? (
          <span className="flex min-w-0 items-center gap-2 text-fg-secondary" title={client.salespeople.join(', ')}>
            <Avatar name={client.salespeople[0]} size="sm" />
            <span className="truncate">{client.salespeople[0]}</span>
            {client.salespeople.length > 1 && <span className="shrink-0 text-xs text-fg-muted">+{client.salespeople.length - 1}</span>}
          </span>
        ) : (
          <span className="text-fg-muted">Unassigned</span>
        ),
    },
    { id: 'recent', header: 'Last update', width: 230, minWidth: 140, sort: 'date', cell: (client) => <LastUpdateLine event={client.lastUpdate} /> },
  ]

  const contactColumns: Column<ContactRow>[] = [
    {
      id: 'name',
      header: 'Name',
      width: 210,
      minWidth: 160,
      sort: 'text',
      cell: (contact) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={contact.name} />
          <div className="min-w-0">
            <span className="block truncate font-medium text-fg">{contact.name}</span>
            <span className="block truncate text-xs text-fg-muted">{contact.jobTitle || '—'}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'client',
      header: 'Client',
      width: 200,
      minWidth: 140,
      sort: 'text',
      cell: (contact) => (
        <span className="flex min-w-0 items-center gap-2">
          <Link to={`/clients/${contact.clientId}`} onClick={(event) => event.stopPropagation()} className="truncate font-medium text-accent hover:text-accent-strong">
            {contact.clientName}
          </Link>
          {scope === 'all' && <MarketIcon scope={contact.market} className="size-3 shrink-0" />}
        </span>
      ),
    },
    { id: 'phone', header: 'Phone', width: 150, minWidth: 120, sort: 'text', cell: (contact) => <span className="truncate tabular-nums text-fg-secondary">{contact.phone || <span className="text-fg-subtle">—</span>}</span> },
    { id: 'email', header: 'Email', width: 230, minWidth: 140, sort: 'text', cell: (contact) => <span className="truncate text-fg-secondary">{contact.email || <span className="text-fg-subtle">—</span>}</span> },
    { id: 'note', header: 'Note', width: 200, minWidth: 120, sort: 'text', cell: (contact) => <span className="truncate text-xs text-fg-tertiary">{contact.note || ''}</span> },
    {
      id: 'rep',
      header: 'Salesperson',
      width: 140,
      minWidth: 110,
      sort: 'text',
      cell: (contact) => <span className="truncate text-fg-secondary">{contact.salespeople.join(', ') || <span className="text-fg-muted">Unassigned</span>}</span>,
    },
  ]

  const data = view === 'clients' ? clients.data : contacts.data
  const busy = view === 'clients' ? clients.isPlaceholderData && clients.isFetching : contacts.isPlaceholderData && contacts.isFetching
  const animateKey = `${view}-${data?.page}-${tab}-${search}-${sort}-${repId}-${orderBy?.by}-${orderBy?.dir}`
  const changeSort = (next: ColumnSort | null, preset?: string) => update({ ...sortParams(next), ...(preset !== undefined && { sort: preset === 'recent' ? null : preset }) })

  return (
    <>
      <PageHeader
        title="Clients & Contacts"
        subtitle={viewer.repId ? 'Companies and people from your leads and deals.' : 'Every company behind a lead or deal, and the people there.'}
        actions={
          <div className="flex items-center gap-2">
            {canAddClients(viewer) && (
              <Button onClick={() => update({ new: '1' })} aria-label="New client" className="max-sm:px-2.5">
                <Plus className="size-4" /> <span className="max-sm:hidden">New client</span>
              </Button>
            )}
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Show">
              {(['clients', 'contacts'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={view === item}
                  onClick={() => update({ view: item === 'clients' ? null : item, tab: null, sort: null, ...sortParams(null) })}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    view === item ? 'bg-brand-500 text-white shadow-sm' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {item === 'clients' ? <Building2 className="size-4" /> : <UsersRound className="size-4" />}
                  {item === 'clients' ? 'Clients' : 'Contacts'}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="sticky top-16 z-10 -mx-4 mb-3 bg-canvas/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-6 md:px-6 xl:-mx-8 xl:px-8">
        {view === 'clients' && (
          <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
            {clientTabs.map((item) => {
              const active = tab === item
              return (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => update({ tab: item === 'all' ? null : item })}
                  className={clsx(
                    'relative flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                    "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-200 after:content-['']",
                    active ? 'text-fg after:scale-x-100' : 'text-fg-muted after:scale-x-0 hover:text-fg',
                  )}
                >
                  {tabLabels[item]}
                  <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] leading-none tabular-nums text-fg-tertiary">{clients.data?.tabCounts[item] ?? '–'}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-0 flex-1 basis-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value)
                setTyping(true)
              }}
              placeholder={view === 'clients' ? 'Search company, contact, phone, email' : 'Search name, company, phone, email'}
              className={clsx(inputClass, 'pl-9')}
              aria-label={view === 'clients' ? 'Search clients' : 'Search contacts'}
            />
          </label>
          {!viewer.repId && (
            <div className="w-full sm:w-48">
              <select className={clsx(selectClass, !repId && 'text-fg-muted')} value={repId} onChange={(event) => update({ rep: event.target.value })} aria-label="Salesperson">
                <option value="">Salesperson: any</option>
                {reps
                  .filter((rep) => scope === 'all' || repWorksIn(rep, scope))
                  .map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="w-full sm:w-52">
            {view === 'clients' ? (
              <SortSelect columns={clientColumns} sort={orderBy} onChange={changeSort} defaults={clientSorts.map((item) => ({ value: item, label: sortLabels[item] }))} defaultValue={sort} />
            ) : (
              <SortSelect columns={contactColumns} sort={orderBy} onChange={changeSort} />
            )}
          </div>
        </div>
      </div>

      {!data ? (
        <TableSkeleton />
      ) : data.items.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
          <span className="rounded-full bg-accent-soft p-3 text-accent">
            <Inbox className="size-6" />
          </span>
          <p className="mt-3 text-sm text-fg-muted">{search ? `Nothing matches "${search}".` : view === 'clients' ? emptyText[tab] : 'No contacts yet.'}</p>
        </div>
      ) : (
        <div className={clsx('transition-opacity duration-200', busy && 'opacity-60')} aria-busy={busy}>
          <div className="hidden sm:block">
            {view === 'clients' ? (
              <DataTable
                label="Clients"
                columns={clientColumns}
                rows={clients.data!.items}
                rowKey={(client) => client.id}
                onRowClick={(client) => navigate(`/clients/${client.id}`)}
                sort={orderBy}
                onSort={(next) => update(sortParams(next))}
                storageKey="spark-crm.clients.columns"
                animateKey={animateKey}
              />
            ) : (
              <DataTable
                label="Contacts"
                columns={contactColumns}
                rows={contacts.data!.items}
                rowKey={(contact) => `${contact.clientId}-${contact.id}`}
                onRowClick={(contact) => navigate(`/clients/${contact.clientId}`)}
                sort={orderBy}
                onSort={(next) => update(sortParams(next))}
                storageKey="spark-crm.contacts.columns"
                animateKey={animateKey}
              />
            )}
          </div>
          <ul key={animateKey} className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface sm:hidden">
            {view === 'clients'
              ? clients.data!.items.map((client) => (
                  <li key={client.id} className="motion-safe:animate-fade-in">
                    <Link to={`/clients/${client.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-surface-sunken">
                      <Avatar name={client.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-fg">{client.name}</span>
                            <span className="block truncate text-xs text-fg-muted">{client.mainContact?.name ?? client.country}</span>
                          </span>
                          <RelationshipBadge relationship={client.relationship} />
                        </div>
                        <LastUpdateLine event={client.lastUpdate} className="mt-1" />
                        {(client.openDeals > 0 || client.wonValue > 0) && (
                          <p className="mt-1.5 text-xs text-fg-tertiary">
                            {[client.openDeals ? `${client.openDeals} open deal${client.openDeals > 1 ? 's' : ''}` : '', client.wonValue ? `${formatCompact(client.wonValue, currency)} won` : ''].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))
              : contacts.data!.items.map((contact) => (
                  <li key={`${contact.clientId}-${contact.id}`} className="motion-safe:animate-fade-in">
                    <Link to={`/clients/${contact.clientId}`} className="flex items-start gap-3 px-4 py-3 active:bg-surface-sunken">
                      <Avatar name={contact.name} />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-fg">{contact.name}</span>
                        <span className="block truncate text-xs text-fg-muted">{[contact.jobTitle, contact.clientName].filter(Boolean).join(' · ')}</span>
                        <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-secondary">
                          {contact.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="size-3" /> {contact.phone}
                            </span>
                          )}
                          {contact.email && (
                            <span className="flex min-w-0 items-center gap-1 truncate">
                              <Mail className="size-3" /> {contact.email}
                            </span>
                          )}
                        </span>
                      </div>
                    </Link>
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
      {params.get('new') && canAddClients(viewer) && <NewClientSheet onClose={() => update({ new: null })} />}
    </>
  )
}

