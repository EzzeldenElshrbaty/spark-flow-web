import { keepPreviousData, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Building2, ChevronRight, LayoutGrid, Search, SquareKanban, UserPlus, UserRound, X, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { roundButtonClass, roundButtonFill } from '../components/ui/styles'
import { useMarket } from '../lib/useMarket'
import { useRole, useViewer } from '../lib/useRole'
import { minSearchLength, searchApi, type SearchGroup } from '../api/search'
import { MarketIcon } from './MarketSwitcher'
import { findShortcuts, shortcutsFor } from './searchShortcuts'

const groupIcons: Record<SearchGroup['kind'], LucideIcon> = { leads: UserPlus, opportunities: SquareKanban, clients: Building2, contacts: UserRound }

type Hit = { id: string; title: string; subtitle: string; link: string; market?: string; icon?: LucideIcon }
/** A block of results: pages, actions, or one kind of record (which ends with "See all" when there are more). */
type Group = { kind: string; label: string; icon: LucideIcon; total: number; hits: Hit[]; seeAll?: string }

/** Waits until typing pauses, like the server call will. */
function useDebounced(value: string, ms = 200) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/** The Accountant works inside Payments, so the search finds pages and actions for them but no sales records. */
const searchesRecords = (role: string) => role !== 'Accountant'
const searchLabel = (role: string) => (searchesRecords(role) ? 'Search pages, actions, leads, clients and opportunities' : 'Search pages and actions')

/** Pages and actions first (as soon as something is typed), then the matching records from the server. */
function useSearch(term: string) {
  const viewer = useViewer()
  const { persona, role } = useRole()
  const { scope } = useMarket()
  const debounced = useDebounced(term.trim())
  const enabled = debounced.length >= minSearchLength && searchesRecords(role)
  const query = useQuery({ queryKey: ['search', persona.id, scope, debounced], queryFn: () => searchApi.search(viewer, scope, debounced), enabled, placeholderData: keepPreviousData, staleTime: 10_000 })
  const all = useMemo(() => shortcutsFor(role), [role])
  const typed = term.trim()
  const groups = useMemo(() => {
    const found = typed.length >= minSearchLength ? findShortcuts(all, typed) : { pages: [], actions: [] }
    const records: Group[] = (enabled ? (query.data ?? []) : []).map((group) => ({ ...group, icon: groupIcons[group.kind] }))
    return [
      ...(found.pages.length ? [{ kind: 'pages', label: 'Pages', icon: LayoutGrid, total: found.pages.length, hits: found.pages }] : []),
      ...(found.actions.length ? [{ kind: 'actions', label: 'Actions', icon: Zap, total: found.actions.length, hits: found.actions }] : []),
      ...records,
    ]
  }, [all, typed, enabled, query.data])
  return { groups, searching: enabled && query.isFetching, ready: !enabled || !!query.data, term: typed, showMarket: scope === 'all' }
}

/** The search term in bold wherever it appears. */
function Highlight({ text, term }: { text: string; term: string }) {
  const index = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-transparent font-semibold text-fg">{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  )
}

type Flat = { key: string; link: string }
const flatten = (groups: Group[]): Flat[] =>
  groups.flatMap((group) => [
    ...group.hits.map((hit) => ({ key: `${group.kind}:${hit.id}`, link: hit.link })),
    ...(group.seeAll && group.total > group.hits.length ? [{ key: `${group.kind}:all`, link: group.seeAll }] : []),
  ])

/** Results grouped by kind; each group ends with "See all" on its list. */
function Results({ groups, term, active, showMarket, onPick, listId }: { groups: Group[]; term: string; active: string | null; showMarket: boolean; onPick: (link: string) => void; listId: string }) {
  return (
    <div id={listId} role="listbox" aria-label="Search results" className="py-1">
      {groups.map((group) => {
        const Icon = group.icon
        return (
          <div key={group.kind} role="group" aria-label={group.label} className="py-1">
            <p className="flex items-center gap-2 px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
              <Icon className="size-3.5" /> {group.label}
              <span className="font-medium normal-case tracking-normal text-fg-subtle">{group.total}</span>
            </p>
            {group.hits.map((hit) => {
              const key = `${group.kind}:${hit.id}`
              const HitIcon = hit.icon
              return (
                <Option key={key} id={`${listId}-${key}`} active={active === key} onPick={() => onPick(hit.link)}>
                  {HitIcon && (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-muted text-fg-tertiary">
                      <HitIcon className="size-3.5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm text-fg-secondary">
                      {showMarket && hit.market && <MarketIcon scope={hit.market} className="size-3.5 shrink-0" />}
                      <span className="truncate">
                        <Highlight text={hit.title} term={term} />
                      </span>
                    </span>
                    <span className="block truncate text-xs text-fg-muted">{hit.subtitle}</span>
                  </span>
                </Option>
              )
            })}
            {group.seeAll && group.total > group.hits.length && (
              <Option id={`${listId}-${group.kind}:all`} active={active === `${group.kind}:all`} onPick={() => onPick(group.seeAll!)}>
                <span className="flex-1 text-xs font-medium text-accent">See all {group.total} {group.label.toLowerCase()}</span>
                <ChevronRight className="size-3.5 text-accent" />
              </Option>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Option({ id, active, onPick, children }: { id: string; active: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      // Keep focus in the input on desktop so typing carries on.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={clsx('flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-surface-muted', active && 'bg-surface-muted')}
    >
      {children}
    </button>
  )
}

function Status({ term, searching, ready, empty }: { term: string; searching: boolean; ready: boolean; empty: boolean }) {
  const { role } = useRole()
  if (term.trim().length < minSearchLength)
    return (
      <p className="px-4 py-6 text-center text-sm text-fg-muted">
        {searchesRecords(role) ? 'Search pages and actions, and leads, opportunities, clients and contacts by name, phone or email.' : 'Search pages and actions.'}
      </p>
    )
  // Pages and actions show at once; the records join them when they arrive.
  if (!empty && !ready) return null
  if (!ready || (searching && empty)) return <p className="px-4 py-6 text-center text-sm text-fg-muted">Searching…</p>
  if (empty) return <p className="px-4 py-6 text-center text-sm text-fg-muted">Nothing matches “{term.trim()}”.</p>
  return null
}

/** Arrow keys move through the results, Enter opens one, Escape closes. */
function useKeyboard(groups: Group[], open: (link: string) => void, close: () => void) {
  const [active, setActive] = useState<string | null>(null)
  const flat = flatten(groups)
  const current = flat.findIndex((item) => item.key === active)
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!flat.length) return
      const next = event.key === 'ArrowDown' ? (current + 1) % flat.length : (current - 1 + flat.length) % flat.length
      setActive(flat[next].key)
    } else if (event.key === 'Enter') {
      const pick = flat[current] ?? flat[0]
      if (pick) open(pick.link)
    } else if (event.key === 'Escape') {
      close()
    }
  }
  return { active: current >= 0 ? active : null, reset: () => setActive(null), onKeyDown }
}

/** The search box in the top bar (tablets and up). Ctrl+K or / jumps to it. */
export function DesktopSearch() {
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const navigate = useNavigate()
  const { groups, searching, ready, term: shownTerm, showMarket } = useSearch(term)
  const { role } = useRole()
  const label = searchLabel(role)

  const close = () => {
    setOpen(false)
    inputRef.current?.blur()
  }
  const go = (link: string) => {
    navigate(link)
    setTerm('')
    close()
  }
  const keys = useKeyboard(groups, go, close)

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
      if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  return (
    <div ref={boxRef} className="relative hidden max-w-md flex-1 md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={keys.active ? `${listId}-${keys.active}` : undefined}
        aria-label={label}
        value={term}
        onChange={(event) => {
          setTerm(event.target.value)
          setOpen(true)
          keys.reset()
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={keys.onKeyDown}
        placeholder={searchesRecords(role) ? 'Search pages, actions, leads, clients…' : 'Search pages and actions…'}
        className="w-full rounded-lg border border-line bg-surface-sunken py-2 pl-9 pr-3 text-sm placeholder:text-fg-subtle focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent-soft"
      />
      {open && term.trim() && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-xl motion-safe:animate-pop-in">
          <Status term={term} searching={searching} ready={ready} empty={!groups.length} />
          {groups.length > 0 && <Results groups={groups} term={shownTerm} active={keys.active} showMarket={showMarket} onPick={go} listId={listId} />}
        </div>
      )}
    </div>
  )
}

/** Phones: a round search button that opens search full screen. */
export function PhoneSearch() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={clsx(roundButtonClass, roundButtonFill, 'text-fg-tertiary md:hidden')} aria-label="Search" title="Search">
        <Search className="size-[18px]" />
      </button>
      {open && createPortal(<SearchScreen onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}

function SearchScreen({ onClose }: { onClose: () => void }) {
  const [term, setTerm] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const navigate = useNavigate()
  const { groups, searching, ready, term: shownTerm, showMarket } = useSearch(term)
  const label = searchLabel(useRole().role)
  const go = (link: string) => {
    navigate(link)
    onClose()
  }
  const keys = useKeyboard(groups, go, onClose)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface motion-safe:animate-fade-in md:hidden" role="dialog" aria-modal="true" aria-label="Search">
      <div className="flex shrink-0 items-center gap-2 border-b border-line-subtle px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-label={label}
            enterKeyHint="search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value)
              keys.reset()
            }}
            onKeyDown={keys.onKeyDown}
            placeholder="Search"
            className="w-full rounded-lg border border-line bg-surface-sunken py-2.5 pl-9 pr-9 text-base placeholder:text-fg-subtle focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent-soft"
          />
          {term && (
            <button type="button" onClick={() => setTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-fg-muted hover:text-fg" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 px-2 py-2 text-sm font-medium text-accent">
          Cancel
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <Status term={term} searching={searching} ready={ready} empty={!groups.length} />
        {groups.length > 0 && <Results groups={groups} term={shownTerm} active={keys.active} showMarket={showMarket} onPick={go} listId={listId} />}
      </div>
    </div>
  )
}
