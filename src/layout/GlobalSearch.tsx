import clsx from 'clsx'
import { LayoutGrid, Search, X, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { roundButtonClass, roundButtonFill } from '@/components/ui/styles'
import { useRole } from '@/lib/useRole'
import { findShortcuts, shortcutsFor } from '@/layout/searchShortcuts'

// TODO(api): when Spark Flow has records, add them below the pages and actions from the server, as Spark CRM's
// GlobalSearch does (design/reference-code/src/layout/GlobalSearch.tsx).

/** Fewer letters than this match too much to be useful. */
const minSearchLength = 2

const searchLabel = 'Search pages and actions'

type Hit = { id: string; title: string; subtitle: string; link: string; icon?: LucideIcon }
/** A block of results: pages or actions. */
type Group = { kind: string; label: string; icon: LucideIcon; total: number; hits: Hit[] }

/** Pages and actions this role can use, as soon as something is typed. */
function useSearch(term: string) {
  const { role } = useRole()
  const all = useMemo(() => shortcutsFor(role), [role])
  const typed = term.trim()
  const groups = useMemo(() => {
    const found = typed.length >= minSearchLength ? findShortcuts(all, typed) : { pages: [], actions: [] }
    return [
      ...(found.pages.length ? [{ kind: 'pages', label: 'Pages', icon: LayoutGrid, total: found.pages.length, hits: found.pages }] : []),
      ...(found.actions.length ? [{ kind: 'actions', label: 'Actions', icon: Zap, total: found.actions.length, hits: found.actions }] : []),
    ]
  }, [all, typed])
  return { groups, term: typed }
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
const flatten = (groups: Group[]): Flat[] => groups.flatMap((group) => group.hits.map((hit) => ({ key: `${group.kind}:${hit.id}`, link: hit.link })))

/** Results grouped by kind. */
function Results({ groups, term, active, onPick, listId }: { groups: Group[]; term: string; active: string | null; onPick: (link: string) => void; listId: string }) {
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
                      <span className="truncate">
                        <Highlight text={hit.title} term={term} />
                      </span>
                    </span>
                    <span className="block truncate text-xs text-fg-muted">{hit.subtitle}</span>
                  </span>
                </Option>
              )
            })}
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
      className={clsx('flex w-full items-center gap-2 px-4 py-2 text-start hover:bg-surface-muted', active && 'bg-surface-muted')}
    >
      {children}
    </button>
  )
}

function Status({ term, empty }: { term: string; empty: boolean }) {
  if (term.trim().length < minSearchLength) return <p className="px-4 py-6 text-center text-sm text-fg-muted">Search pages and actions.</p>
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
  const { groups, term: shownTerm } = useSearch(term)

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
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={keys.active ? `${listId}-${keys.active}` : undefined}
        aria-label={searchLabel}
        value={term}
        onChange={(event) => {
          setTerm(event.target.value)
          setOpen(true)
          keys.reset()
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={keys.onKeyDown}
        placeholder="Search pages and actions…"
        className="w-full rounded-lg border border-line bg-surface-sunken py-2 ps-9 pe-3 text-sm placeholder:text-fg-subtle focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent-soft"
      />
      {open && term.trim() && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-xl motion-safe:animate-pop-in">
          <Status term={term} empty={!groups.length} />
          {groups.length > 0 && <Results groups={groups} term={shownTerm} active={keys.active} onPick={go} listId={listId} />}
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
  const { groups, term: shownTerm } = useSearch(term)
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
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-label={searchLabel}
            enterKeyHint="search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value)
              keys.reset()
            }}
            onKeyDown={keys.onKeyDown}
            placeholder="Search"
            className="w-full rounded-lg border border-line bg-surface-sunken py-2.5 ps-9 pe-9 text-base placeholder:text-fg-subtle focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent-soft"
          />
          {term && (
            <button type="button" onClick={() => setTerm('')} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-fg-muted hover:text-fg" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 px-2 py-2 text-sm font-medium text-accent">
          Cancel
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <Status term={term} empty={!groups.length} />
        {groups.length > 0 && <Results groups={groups} term={shownTerm} active={keys.active} onPick={go} listId={listId} />}
      </div>
    </div>
  )
}
