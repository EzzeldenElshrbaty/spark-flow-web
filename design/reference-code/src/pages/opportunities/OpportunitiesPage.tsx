import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Columns3, Inbox, List, Lock, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Card } from '../../components/ui/Card'
import { DataTable, TableSkeleton, type Column } from '../../components/ui/DataTable'
import { inputClass, selectClass } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { SortSelect } from '../../components/ui/SortSelect'
import { pageSizes } from '../../components/ui/styles'
import { daysSince, formatCompact, formatDate, isPast } from '../../lib/format'
import { columnSortFrom, sortParams, type ColumnSort } from '../../lib/sorting'
import { useMarket } from '../../lib/useMarket'
import { useRole, useViewer } from '../../lib/useRole'
import { repWorksIn, reps } from '../../mocks/leads'
import { expectedCloseEnabled } from '../../lib/features'
import { isOpportunityManager, opportunitiesApi, opportunityFlags, opportunitySorts, opportunityTabs, type OpportunityFlag, type OpportunityQuery, type OpportunityRow, type OpportunitySort, type OpportunityTab } from '../../api/opportunities'
import { allNavItems, canSee } from '../../navigation'
import { Avatar } from '../leads/shared'
import { DealCard } from './DealCard'
import { OpportunityBoard } from './OpportunityBoard'
import { PipelineSummary } from './PipelineSummary'
import { LastUpdateLine, NextStepView } from '../followUps/shared'
import { Money, StageBadge } from './shared'
import { usePipelineStages } from './useOpportunities'

const tabLabels: Record<OpportunityTab, string> = { open: 'Open', hold: 'On hold', won: 'Won', lost: 'Lost', all: 'All' }
const sortLabels: Record<OpportunitySort, string> = { value: 'Highest value', close: 'Closing soonest', newest: 'Newest first', stage: 'Furthest stage' }
const oneOf = <T extends string>(value: string | null, options: readonly T[], fallback: T) => (options.includes(value as T) ? (value as T) : fallback)

export function OpportunitiesPage() {
  const { role } = useRole()
  const viewer = useViewer()
  const { scope } = useMarket()
  const stages = usePipelineStages()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const manager = isOpportunityManager(viewer.role)
  const view = params.get('view') === 'list' ? 'list' : 'board'
  const query: OpportunityQuery = {
    tab: oneOf(params.get('tab'), opportunityTabs, 'open'),
    search: params.get('q') ?? '',
    stageId: params.get('stage') ?? '',
    repId: params.get('rep') ?? '',
    flag: oneOf<OpportunityFlag | ''>(params.get('flag'), ['', ...opportunityFlags], ''),
    sort: oneOf(params.get('sort'), opportunitySorts, 'value'),
    orderBy: columnSortFrom(params),
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: Number(oneOf(params.get('size'), pageSizes.map(String), '20')),
  }

  const update = (changes: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: !('page' in changes) && !('tab' in changes) && !('view' in changes) })
  }

  // Search goes to the server 300ms after typing stops; Back and links update the box.
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

  const list = useQuery({
    queryKey: ['opportunities', 'list', viewer.role, viewer.name, scope, query],
    queryFn: () => opportunitiesApi.list(viewer, scope, query),
    placeholderData: keepPreviousData,
    enabled: view === 'list',
  })

  // The board's own query (same key, so it is fetched once); its summary feeds the tiles.
  const board = useQuery({
    queryKey: ['opportunities', 'board', viewer.role, viewer.name, scope, query.search, query.repId ?? ''],
    queryFn: () => opportunitiesApi.board(viewer, scope, query.search, query.repId ?? ''),
    enabled: view === 'board',
  })

  const item = allNavItems.find((navItem) => navItem.path === '/opportunities')!
  if (!canSee(item, role)) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-8 text-center">
        <Lock className="mx-auto size-8 text-fg-subtle" />
        <h1 className="mt-3 text-lg font-semibold">No access</h1>
        <p className="mt-1 text-sm text-fg-muted">The {role} role can't open Opportunities.</p>
      </Card>
    )
  }

  const stageName = (id: string) => stages.find((stage) => stage.id === id)?.label ?? id
  const data = list.data
  const columns: Column<OpportunityRow>[] = [
    {
      id: 'company',
      header: 'Opportunity',
      width: 220,
      minWidth: 180,
      sort: 'text',
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={row.company} />
          <div className="min-w-0">
            <Link to={`/opportunities/${row.id}`} onClick={(event) => event.stopPropagation()} className="block truncate font-medium text-fg hover:underline">
              {row.company}
            </Link>
            <span className="block truncate text-xs text-fg-muted">{row.contactName}</span>
          </div>
        </div>
      ),
    },
    { id: 'stage', header: 'Stage', width: 140, minWidth: 110, sort: 'order', cell: (row) => <StageBadge stage={stageName(row.stageId)} status={row.status} /> },
    { id: 'value', header: 'Value', width: 120, minWidth: 100, align: 'right', sort: 'number', cell: (row) => <Money value={row.value} currency={row.currency} className="text-fg-secondary" /> },
    { id: 'probability', header: 'Prob.', width: 70, minWidth: 60, align: 'right', sort: 'number', cell: (row) => <span className="tabular-nums text-fg-muted">{row.probability}%</span> },
    ...(manager
      ? [
          {
            id: 'rep',
            header: 'Salesperson',
            width: 140,
            minWidth: 110,
            sort: 'text' as const,
            cell: (row: OpportunityRow) => (
              <span className="flex min-w-0 items-center gap-2 text-fg-secondary">
                {row.repName && <Avatar name={row.repName} size="sm" />}
                <span className={clsx('truncate', !row.repName && (row.status === 'Open' || row.status === 'On hold') && 'font-medium text-amber-700 dark:text-amber-400')}>
                  {row.repName ?? (row.status === 'Open' || row.status === 'On hold' ? 'Needs owner' : '—')}
                </span>
              </span>
            ),
          },
        ]
      : []),
    {
      id: 'next',
      header: 'Next step',
      width: 190,
      minWidth: 140,
      sort: 'date',
      cell: (row) =>
        row.status === 'Open' ? (
          <NextStepView step={row.nextAction} />
        ) : (
          <span className="text-xs text-fg-muted">
            {row.status === 'On hold' ? `Back ${row.holdUntil ? formatDate(row.holdUntil) : '—'} · ${row.holdReason}` : (row.lostReason ?? (row.closedAt ? `Closed ${formatDate(row.closedAt)}` : '—'))}
          </span>
        ),
    },
    { id: 'update', header: 'Last update', width: 220, minWidth: 140, sort: 'date', cell: (row) => <LastUpdateLine event={row.lastUpdate} /> },
    // Expected close is switched off for now (lib/features).
    ...(expectedCloseEnabled
      ? [
          {
            id: 'close',
            header: 'Expected close',
            width: 120,
            minWidth: 100,
            align: 'right' as const,
            sort: 'date' as const,
            cell: (row: OpportunityRow) => <span className={clsx('text-xs tabular-nums', row.status === 'Open' && isPast(row.expectedClose) ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg-muted')}>{formatDate(row.expectedClose)}</span>,
          },
        ]
      : []),
    { id: 'age', header: 'In stage', width: 80, minWidth: 70, align: 'right', sort: 'number', cell: (row) => <span className="text-xs tabular-nums text-fg-muted">{row.status === 'Open' || row.status === 'On hold' ? daysSince(row.stageSince) : '—'}</span> },
  ]

  return (
    <>
      <PageHeader
        title="Opportunities"
        subtitle={viewer.repId ? 'Your deals, from preparing the proposal to signed.' : 'The pipeline, from preparing the proposal to signed.'}
        actions={
          <div className="inline-flex rounded-lg bg-surface-muted p-0.5 ring-1 ring-line" role="group" aria-label="View">
            {(
              [
                ['board', 'Board', Columns3],
                ['list', 'List', List],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => update({ view: value === 'board' ? null : value })}
                className={clsx('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium', view === value ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:text-fg')}
              >
                <Icon className="size-4" />
                <span className="max-sm:sr-only">{label}</span>
              </button>
            ))}
          </div>
        }
      />

      {/* Needs-attention tiles, as on Leads. On the board they open the list filtered; in the list they filter it. */}
      <PipelineSummary
        showNeedsOwner={manager}
        counts={
          view === 'board'
            ? board.data && { ...board.data.summary.flags, hold: board.data.summary.onHold }
            : list.data && { ...list.data.flagCounts, hold: list.data.tabCounts.hold }
        }
        active={view === 'list' ? query.flag || (query.tab === 'hold' ? 'hold' : '') : ''}
        onPick={(key) => {
          if (view === 'board') return update(key === 'hold' ? { view: 'list', tab: 'hold' } : { view: 'list', flag: key })
          if (key === 'hold') return update({ tab: query.tab === 'hold' ? null : 'hold', flag: null })
          update({ flag: query.flag === key ? null : key })
        }}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value)
              setTyping(true)
            }}
            placeholder="Search company, contact, number"
            className={clsx(inputClass, 'pl-9')}
            aria-label="Search opportunities"
          />
        </label>
        {manager && (
          <div className="w-full sm:w-48">
            <select className={clsx(selectClass, !query.repId && 'text-fg-muted')} value={query.repId} onChange={(event) => update({ rep: event.target.value })} aria-label="Salesperson">
              <option value="">Salesperson: any</option>
              {reps
                .filter((rep) => (scope === 'all' || repWorksIn(rep, scope)) && (rep.market === '*' || viewer.markets.includes(rep.market)))
                .map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.name}
                  </option>
                ))}
            </select>
          </div>
        )}
        {view === 'list' && (
          <>
            <div className="w-[calc(50%-0.25rem)] sm:w-44">
              <select className={clsx(selectClass, !query.stageId && 'text-fg-muted')} value={query.stageId} onChange={(event) => update({ stage: event.target.value })} aria-label="Stage">
                <option value="">Stage: any</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-[calc(50%-0.25rem)] sm:w-44">
              <SortSelect
                columns={columns}
                sort={query.orderBy ?? null}
                onChange={(sort, preset) => update({ ...sortParams(sort), ...(preset !== undefined && { sort: preset }) })}
                defaults={opportunitySorts.filter((sort) => expectedCloseEnabled || sort !== 'close').map((sort) => ({ value: sort, label: sortLabels[sort] }))}
                defaultValue={query.sort}
              />
            </div>
          </>
        )}
      </div>

      {view === 'board' ? (
        <OpportunityBoard search={query.search} repId={query.repId ?? ''} />
      ) : (
        <>

          <div className={clsx('mb-3 flex gap-1 overflow-x-auto border-b border-line', query.flag && 'opacity-50')} role="tablist">
            {opportunityTabs.map((tab) => {
              const active = query.tab === tab && !query.flag
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => update({ tab: tab === 'open' ? null : tab, flag: null })}
                  className={clsx(
                    'relative flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                    "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-200 after:content-['']",
                    active ? 'text-fg after:scale-x-100' : 'text-fg-muted after:scale-x-0 hover:text-fg',
                  )}
                >
                  {tabLabels[tab]}
                  <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] leading-none tabular-nums text-fg-tertiary">{data?.tabCounts[tab] ?? '–'}</span>
                </button>
              )
            })}
          </div>

          {data && data.total > 0 && (
            <p className="mb-3 text-sm text-fg-muted">
              <span className="font-semibold text-fg">{formatCompact(data.totals.value, data.currency)}</span> in {data.total} {data.total === 1 ? 'deal' : 'deals'}
              {query.tab === 'open' && (
                <>
                  {' · '}weighted <span className="font-semibold text-fg">{formatCompact(data.totals.weighted, data.currency)}</span>
                </>
              )}
              {scope === 'all' && ' · EGP at indicative rates'}
            </p>
          )}

          {!data ? (
            <TableSkeleton />
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
              <span className="rounded-full bg-accent-soft p-3 text-accent">
                <Inbox className="size-6" />
              </span>
              <p className="mt-3 text-sm text-fg-muted">{query.search ? `Nothing matches "${query.search}".` : 'No opportunities here.'}</p>
              {(query.search || query.stageId || query.repId) && (
                <button type="button" onClick={() => update({ q: null, stage: null, rep: null })} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent">
                  <X className="size-3.5" /> Clear search and filters
                </button>
              )}
            </div>
          ) : (
            <div className={clsx('transition-opacity duration-200', list.isPlaceholderData && list.isFetching && 'opacity-60')} aria-busy={list.isFetching}>
              <div className="hidden sm:block">
                <DataTable
                  label="Opportunities"
                  columns={columns}
                  rows={data.items}
                  rowKey={(row) => row.id}
                  onRowClick={(row) => navigate(`/opportunities/${row.id}`)}
                  sort={query.orderBy}
                  onSort={(sort: ColumnSort | null) => update(sortParams(sort))}
                  storageKey="spark-crm.opportunities.columns"
                  animateKey={`${data.page}-${query.tab}-${query.search}-${query.sort}-${params.get('by')}-${params.get('dir')}`}
                />
              </div>
              <ul className="space-y-2.5 sm:hidden">
                {data.items.map((row) => (
                  <li key={row.id} className="motion-safe:animate-fade-in">
                    <DealCard row={row} showRep={manager} stageLabel={row.status === 'Open' ? <StageBadge stage={stageName(row.stageId)} status={row.status} /> : undefined} />
                  </li>
                ))}
              </ul>
              <Pagination
                page={data.page}
                pageCount={data.pageCount}
                pageSize={query.pageSize}
                total={data.total}
                onPage={(page) => update({ page: page === 1 ? null : page })}
                onPageSize={(size) => update({ size: size === 20 ? null : size })}
              />
            </div>
          )}
        </>
      )}
    </>
  )
}
