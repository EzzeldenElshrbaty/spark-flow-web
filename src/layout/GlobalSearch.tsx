import clsx from 'clsx'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { IconBolt, IconLayoutGrid, IconListCheck, IconSearch, IconUser, IconX, type TablerIcon } from '@tabler/icons-react'
import { Kbd } from '@/components/sf/Badge'
import { Button, IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { useChannels, useOpenDm } from '@/api/chat'
import { useProjects, useTasksOf } from '@/api/tickets'
import { useUsers } from '@/api/users'
import { isActive } from '@/lib/people'
import { roundButton } from '@/layout/roundButton'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useRole } from '@/lib/useRole'
import { findShortcuts, opensSearch, peopleShortcuts, searchPlaceholder, shortcutsFor, taskShortcuts, workspaceShortcuts } from '@/layout/searchShortcuts'
import { useWorkspaceMode } from '@/layout/useWorkspaceMode'
import { paths } from '@/lib/paths'
import { useFocusOnArrival } from '@/lib/openSearch'
import { usePreferences } from '@/api/preferences'
import { useRestoreFocus } from '@/components/sf/layers'
import { useMedia } from '@/components/sf/usePhone'
import { useMyTimer } from '@/layout/useMyTimer'

// It jumps to pages, channels, DMs, projects, tasks and people; its last row (and ⌘/Ctrl+Enter) opens Search, which
// looks through what people wrote (spec 6.12).

/** Fewer letters than this match too much to be useful. */
const minSearchLength = 2

const searchLabel = 'Search pages, tasks, people and channels'

type Hit = { id: string; title: string; subtitle: string; link: string; icon?: TablerIcon }
/** A block of results: pages or actions. */
type Group = { kind: string; label: string; icon: TablerIcon; total: number; hits: Hit[] }

/** The last group: one row that opens Search for the words (spec 6.12). */
const SEARCH_KIND = 'search'

/** Pages and actions my permissions allow, plus the open workspace's channels, DMs and projects, as soon as something is typed. */
function useSearch(term: string) {
  const { grants, persona } = useRole()
  const { workspace } = useCurrentWorkspace()
  const channels = useChannels(workspace?.id).data
  const projects = useProjects(workspace?.id).data
  const users = useUsers(workspace?.id).data
  const tasks = useTasksOf((projects ?? []).map((p) => p.id)).data
  const all = useMemo(() => {
    const base = shortcutsFor(grants, workspace?.slug ?? null)
    if (!workspace) return base
    return { ...base, pages: [...base.pages, ...workspaceShortcuts(workspace, channels ?? [], projects ?? [], users ?? [], persona.id)] }
  }, [grants, workspace, channels, projects, users, persona.id])
  const typed = term.trim()
  const long = typed.length >= minSearchLength
  const taskHits = useMemo(() => (long && workspace ? taskShortcuts(workspace.slug, tasks, projects ?? [], typed) : []), [long, workspace, tasks, projects, typed])
  // Deactivated people (slice 3) aren't offered: there's no starting a conversation with them.
  const peopleHits = useMemo(() => (long ? peopleShortcuts((users ?? []).filter(isActive), persona.id, typed) : []), [long, users, persona.id, typed])
  const groups = useMemo(() => {
    const found = typed.length >= minSearchLength ? findShortcuts(all, typed) : { pages: [], actions: [] }
    return [
      ...(found.pages.length ? [{ kind: 'pages', label: 'Go to', icon: IconLayoutGrid, total: found.pages.length, hits: found.pages }] : []),
      ...(found.actions.length ? [{ kind: 'actions', label: 'Actions', icon: IconBolt, total: found.actions.length, hits: found.actions }] : []),
      ...(taskHits.length ? [{ kind: 'tasks', label: 'Tasks', icon: IconListCheck, total: taskHits.length, hits: taskHits }] : []),
      ...(peopleHits.length ? [{ kind: 'people', label: 'People', icon: IconUser, total: peopleHits.length, hits: peopleHits }] : []),
      ...(typed && workspace
        ? [{ kind: SEARCH_KIND, label: 'Search', icon: IconSearch, total: 1, hits: [{ id: 'all', title: `Search messages and files for “${typed}”`, subtitle: 'Messages, files, tasks, channels and people', link: paths.search(workspace.slug, typed), icon: IconSearch }] }]
        : []),
    ]
  }, [all, typed, taskHits, peopleHits, workspace])
  return { groups, term: typed }
}

/**
 * Going to a result: a page or channel link, or `dm:<userId>` for a person, which opens your conversation with them.
 * `failed` is the sentence to show near the box when that didn't work.
 */
function useGo(after: (link: string) => void) {
  const navigate = useNavigate()
  const { workspace } = useCurrentWorkspace()
  const openDm = useOpenDm()
  const [failed, setFailed] = useState<string | null>(null)
  const go = (link: string) => {
    setFailed(null)
    if (!link.startsWith('dm:')) {
      navigate(link)
      after(link)
      return
    }
    if (!workspace) return
    openDm.mutate(
      { workspaceId: workspace.id, userIds: [link.slice(3)] },
      {
        onSuccess: (dm) => {
          navigate(paths.channel(workspace.slug, dm.id))
          after(link)
        },
        onError: () => setFailed("Couldn’t open the conversation."),
      },
    )
  }
  return { go, failed }
}

/** The search term in bold wherever it appears. */
function Highlight({ text, term }: { text: string; term: string }) {
  const index = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-transparent font-semibold text-sf-text">{text.slice(index, index + term.length)}</mark>
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
        return (
          <div key={group.kind} role="group" aria-label={group.label} className="py-1">
            <p className="sf-label m-0 flex items-center gap-2 px-4 pt-2 pb-1 text-sf-text-muted">
              <Icon icon={group.icon} size={14} /> {group.label}
              <span className="sf-meta normal-case tracking-normal text-sf-text-muted">{group.total}</span>
            </p>
            {group.hits.map((hit) => {
              const key = `${group.kind}:${hit.id}`
              return (
                <Option key={key} id={`${listId}-${key}`} active={active === key} onPick={() => onPick(hit.link)}>
                  {hit.icon && (
                    <span className="grid size-7 flex-none place-items-center rounded-sf-md bg-sf-surface-sunken text-sf-text-secondary">
                      <Icon icon={hit.icon} size={16} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="sf-ui flex items-center gap-1.5 truncate text-sf-text">
                      <span className="truncate">
                        <Highlight text={hit.title} term={term} />
                      </span>
                    </span>
                    <span className="sf-meta block truncate text-sf-text-muted">{hit.subtitle}</span>
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
      className={clsx('flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-start hover:bg-sf-surface-hover', active && 'bg-sf-surface-hover')}
    >
      {children}
    </button>
  )
}

function Status({ term, empty }: { term: string; empty: boolean }) {
  if (term.trim().length < minSearchLength) return <p className="sf-small m-0 px-4 py-6 text-center text-sf-text-muted">Search pages, channels and projects.</p>
  if (empty) return <p className="sf-small m-0 px-4 py-6 text-center text-sf-text-muted">Nothing matches “{term.trim()}”.</p>
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
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      const search = groups.find((g) => g.kind === SEARCH_KIND)?.hits[0]
      if (search) {
        event.preventDefault()
        open(search.link)
      }
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
/** ⌘ on Apple keyboards, Ctrl elsewhere (both work). */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** On Search, the box shows its query (spec 5.2); elsewhere it starts empty. */
function useSearchTerm() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const onSearch = /^\/w\/[^/]+\/search\/?$/.test(pathname)
  const query = onSearch ? (params.get('q') ?? '') : ''
  const [term, setTerm] = useState(query)
  // A new query in the address (Search opened, a chip, Back) replaces what the box holds.
  const [shown, setShown] = useState(query)
  if (query !== shown) {
    setShown(query)
    setTerm(query)
  }
  return [term, setTerm] as const
}

/**
 * Below 1280 while a timer runs the top bar has no room for the search box (the pill takes it): search is then the
 * round button and its screen, as on a phone (UX Phase 5B, 5.3).
 */
/** The round Search button's id: the folded box hands it the caret (UX Phase 5B final review). */
const SEARCH_BUTTON_ID = 'top-bar-search'

export function useCompactSearch(): boolean {
  const timer = useMyTimer()
  const wide = useMedia('(min-width: 1280px)')
  return Boolean(timer) && !wide
}

export function DesktopSearch({ onOpenScreen }: { onOpenScreen: () => void }) {
  const compact = useCompactSearch()
  const location = useLocation()
  const navigate = useNavigate()
  const side = useWorkspaceMode()
  const [term, setTerm] = useSearchTerm()
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const { groups, term: shownTerm } = useSearch(term)

  const close = () => {
    setOpen(false)
    inputRef.current?.blur()
  }
  // Opening Search keeps the words in the box (it shows the query there); anywhere else the box empties.
  const { go, failed } = useGo((link) => {
    if (!/^\/w\/[^/]+\/search(\?|$)/.test(link)) setTerm('')
    close()
  })
  const keys = useKeyboard(groups, go, close)

  // Sent here by the channel's 🔍, ⌘F or /search: the caret goes in the box, after the query; with the box folded away,
  // the search screen opens instead (UX Phase 5B, 5.3).
  useFocusOnArrival(inputRef)
  // Folding away while it has the caret (a timer started elsewhere): the caret goes to the round button, not nowhere.
  useLayoutEffect(() => {
    if (compact && document.activeElement === inputRef.current) document.getElementById(SEARCH_BUTTON_ID)?.focus()
  }, [compact])
  useEffect(() => {
    if (!compact || (location.state as { focus?: string } | null)?.focus !== 'search') return
    onOpenScreen()
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null })
    // Only on a new arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, compact])

  // "/" can be turned off in Preferences → Keyboard (UX Phase 5A, 5.13); on while they load.
  const singleKeys = usePreferences().data?.singleKeyShortcuts ?? true
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (opensSearch(event, singleKeys)) {
        event.preventDefault()
        if (compact) onOpenScreen()
        else inputRef.current?.focus()
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
  }, [singleKeys, compact, onOpenScreen])

  return (
    <div ref={boxRef} className={clsx('relative hidden w-full max-w-[440px] min-w-0', !compact && 'md:block')}>
      <Icon icon={IconSearch} size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sf-text-muted" />
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={keys.active ? `${listId}-${keys.active}` : undefined}
        aria-label={searchLabel}
        aria-keyshortcuts="Meta+K Control+K"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value)
          setOpen(true)
          keys.reset()
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={keys.onKeyDown}
        placeholder={searchPlaceholder(side)}
        className="sf-ui h-sf-input w-full truncate rounded-sf-md border border-sf-line bg-sf-surface-sunken ps-9 pe-16 text-sf-text outline-none placeholder:text-sf-text-muted focus:border-sf-focus focus:shadow-[0_0_0_3px_var(--surface-mention)]"
      />
      <span className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {term ? (
          <IconButton
            label="Clear search"
            icon={IconX}
            size="xs"
            onClick={() => {
              setTerm('')
              keys.reset()
              inputRef.current?.focus()
            }}
          />
        ) : (
          <span aria-hidden className="flex gap-1">
            <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>K</Kbd>
          </span>
        )}
      </span>
      {open && term.trim() && (
        <div className="absolute inset-x-0 top-full z-[var(--z-menu)] mt-2 max-h-[70vh] overflow-y-auto rounded-sf-lg bg-sf-surface-raised py-1 shadow-sf-menu">
          <Status term={term} empty={!groups.length} />
          {groups.length > 0 && <Results groups={groups} term={shownTerm} active={keys.active} onPick={go} listId={listId} />}
          {failed && (
            <p role="alert" className="sf-small m-0 px-4 py-2 text-sf-error">
              {failed}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Phones: a round search button that opens search full screen. */
export function PhoneSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // From tablets up the box is the way in, unless a running timer has folded it away (UX Phase 5B, 5.3).
  const compact = useCompactSearch()
  // The screen never stays open where it can't be seen (the timer stopped, a wider window): it closes.
  const tablet = useMedia('(min-width: 768px)')
  useEffect(() => {
    if (open && tablet && !compact) onOpenChange(false)
  }, [open, tablet, compact, onOpenChange])
  return (
    <>
      <button
        type="button"
        id={SEARCH_BUTTON_ID}
        onClick={() => onOpenChange(true)}
        aria-label="Search"
        title="Search"
        className={clsx(roundButton, !compact && 'md:hidden')}
      >
        <Icon icon={IconSearch} />
      </button>
      {open && createPortal(<SearchScreen everywhere={compact} onClose={() => onOpenChange(false)} />, document.body)}
    </>
  )
}

function SearchScreen({ onClose, everywhere = false }: { onClose: () => void; everywhere?: boolean }) {
  // It starts with Search's query, as the box does (spec 5.2), and gives focus back when it closes (UX Phase 5B).
  const [term, setTerm] = useSearchTerm()
  useRestoreFocus(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const { groups, term: shownTerm } = useSearch(term)
  const { go, failed } = useGo(onClose)
  const keys = useKeyboard(groups, go, onClose)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    // Portaled to the page's end, so it brings the chat tokens with it.
    <div className={clsx('sf fixed inset-0 z-[var(--z-modal)] flex flex-col bg-sf-surface text-sf-text', !everywhere && 'md:hidden')} role="dialog" aria-modal="true" aria-label="Search">
      <div className="flex flex-none items-center gap-2 border-b border-sf-line px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2">
        <div className="relative flex-1">
          <Icon icon={IconSearch} size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sf-text-muted" />
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
            className="h-11 w-full rounded-sf-md border border-sf-line bg-sf-surface-sunken ps-9 pe-11 text-[16px] text-sf-text outline-none placeholder:text-sf-text-muted focus:border-sf-focus focus:bg-sf-surface focus:shadow-[0_0_0_3px_var(--surface-mention)]"
          />
          {term && (
            <span className="absolute end-0 top-1/2 -translate-y-1/2">
              <IconButton label="Clear search" icon={IconX} size="sm" tone="muted" className="size-11" onClick={() => setTerm('')} />
            </span>
          )}
        </div>
        <Button variant="ghost" touch onClick={onClose}>
          Cancel
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <Status term={term} empty={!groups.length} />
        {groups.length > 0 && <Results groups={groups} term={shownTerm} active={keys.active} onPick={go} listId={listId} />}
          {failed && (
            <p role="alert" className="sf-small m-0 px-4 py-2 text-sf-error">
              {failed}
            </p>
          )}
      </div>
    </div>
  )
}
