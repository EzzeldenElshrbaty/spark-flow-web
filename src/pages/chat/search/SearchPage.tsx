import { IconChevronDown, IconFile, IconHash, IconListCheck, IconLock, IconSearch, IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import { useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useChannels, useOpenDm } from '@/api/chat'
import { viewerZone } from '@/api/scheduled'
import { useSearch } from '@/api/search'
import type { Channel, SearchHit, SearchSort, SearchTab, User } from '@/api/types'
import { useUsers } from '@/api/users'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { Tabs, type TabItem } from '@/components/sf/Tabs'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { channelLabel } from '@/lib/channels'
import { sizeText } from '@/lib/fileTypes'
import { senderName } from '@/lib/flowbot'
import { formatDate, formatWhen } from '@/lib/format'
import { withInspector } from '@/lib/inspector'
import { useFocusOnArrival } from '@/lib/openSearch'
import { paths } from '@/lib/paths'
import { filterOf, parseQuery, withFilter, withoutFilter, type FilterKey } from '@/lib/searchQuery'
import { useRole } from '@/lib/useRole'
import { handleOf, resolveSearch } from '@/pages/chat/search/resolveSearch'
import { SearchResultCard } from '@/pages/chat/search/SearchResultCard'

const TABS: { id: SearchTab; label: string }[] = [
  { id: 'messages', label: 'Messages' },
  { id: 'files', label: 'Files' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'channels', label: 'Channels' },
  { id: 'people', label: 'People' },
]
const SORTS: { id: SearchSort; label: string }[] = [
  { id: 'relevant', label: 'Most relevant' },
  { id: 'newest', label: 'Newest' },
]
const HAS = [
  { id: 'file', label: 'Files' },
  { id: 'link', label: 'Links' },
  { id: 'pin', label: 'Pinned' },
  { id: 'reaction', label: 'Reactions' },
]

/** A local day, YYYY-MM-DD, `days` before today. */
const dayBack = (days: number, now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const DATES = [
  { id: 'today', label: 'Today', days: 0 },
  // `after` counts its own day: today and the 6 days before are 7 days.
  { id: 'week', label: 'Last 7 days', days: 6 },
  { id: 'month', label: 'Last 30 days', days: 29 },
]

const isTab = (v: string | null): v is SearchTab => TABS.some((t) => t.id === v)

/**
 * Search (spec 6.12), for the query in the address (`?q=`, `tab`, `sort`): "Results for", Sort, the five tabs with their
 * counts, the chips that rewrite the query, and the results. The top bar's box types the query (spec 5.2).
 */
export function SearchPage() {
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') ?? ''
  const tab: SearchTab = isTab(params.get('tab')) ? (params.get('tab') as SearchTab) : 'messages'
  const sort: SearchSort = params.get('sort') === 'newest' ? 'newest' : 'relevant'
  const users = useUsers(workspace?.id).data
  const channels = useChannels(workspace?.id).data
  const parsed = useMemo(() => parseQuery(q), [q])
  const resolved = useMemo(() => (users && channels ? resolveSearch(parsed, { users, channels, meId: persona.id }) : null), [parsed, users, channels, persona.id])
  const request = useMemo(() => (resolved?.request ? { ...resolved.request, tab, sort, tz: viewerZone() } : null), [resolved, tab, sort])
  const search = useSearch(workspace?.id, request)
  const panelId = useId()
  const ws = workspace?.slug ?? ''

  const set = (next: Record<string, string | null>) =>
    setParams((p) => {
      const out = new URLSearchParams(p)
      for (const [k, v] of Object.entries(next)) if (v === null) out.delete(k)
      else out.set(k, v)
      return out
    })
  const setFilter = (key: FilterKey, value: string | null) => set({ q: value === null ? withoutFilter(q, key) : withFilter(q, key, value) })

  const pages = search.data?.pages
  const counts = pages?.[0]?.counts
  const items = pages?.flatMap((p) => p.items) ?? []
  const tabs: TabItem<SearchTab>[] = TABS.map((t) => ({ ...t, count: request ? counts?.[t.id] : undefined }))
  const people = users ?? []
  const placeOf = (channelId: string) => {
    const channel = channels?.find((c) => c.id === channelId)
    return !channel ? 'a conversation' : channel.kind === 'channel' ? `#${channel.name}` : channelLabel(channel, people, persona.id)
  }
  const filtered = (['from', 'in', 'has', 'is', 'after', 'before'] as FilterKey[]).some((k) => filterOf(q, k) !== null)

  return (
    <div className="sf flex min-h-0 flex-1 flex-col">
      <section aria-labelledby="search-title" className="flex min-h-0 min-w-0 flex-1 flex-col bg-sf-surface">
        <header className="flex h-sf-header flex-none items-center gap-3 ps-4 pe-4 sm:ps-6">
          <h1 id="search-title" className="sf-title min-w-0 flex-1 truncate text-sf-text">
            {q.trim() ? `Results for “${q.trim()}”` : 'Search'}
          </h1>
          <Menu
            label="Sort"
            trigger={(props) => (
              <button type="button" aria-label={`Sort: ${SORTS.find((s) => s.id === sort)!.label}`} {...props} className="sf-focus sf-small relative inline-flex h-8 cursor-pointer items-center gap-1 rounded-sf-md px-2 font-medium text-sf-text-secondary hover:bg-sf-surface-hover max-md:after:absolute max-md:after:-inset-y-1.5 max-md:after:inset-x-0">
                {SORTS.find((s) => s.id === sort)!.label}
                <Icon icon={IconChevronDown} size={16} />
              </button>
            )}
          >
            {SORTS.map((s) => (
              <MenuItem key={s.id} checked={s.id === sort} onSelect={() => set({ sort: s.id === 'relevant' ? null : s.id })}>
                {s.label}
              </MenuItem>
            ))}
          </Menu>
        </header>
        <PhoneQuery q={q} onSearch={(next) => set({ q: next.trim() ? next : null })} />
        <Tabs label="Results" tabs={tabs} tab={tab} onChange={(t) => set({ tab: t === 'messages' ? null : t })} panelId={panelId} />
        <div role="group" aria-label="Filters" className="flex flex-none flex-wrap items-center gap-2 px-4 pt-3 sm:px-6">
          <Chip
            name="From"
            value={filterOf(q, 'from')}
            shown={(v) => people.find((u) => `@${handleOf(u)}` === v)?.name ?? v}
            options={people.map((u) => ({ id: `@${handleOf(u)}`, label: u.name }))}
            onPick={(v) => setFilter('from', v)}
          />
          <Chip
            name="In"
            value={filterOf(q, 'in')}
            shown={(v) => (v.startsWith('@') ? (people.find((u) => `@${handleOf(u)}` === v)?.name ?? v) : v)}
            options={inOptions(channels ?? [], people, persona.id)}
            onPick={(v) => setFilter('in', v)}
          />
          <Chip
            name="Date"
            value={filterOf(q, 'after')}
            shown={(v) => DATES.find((d) => dayBack(d.days) === v)?.label ?? `Since ${formatDate(`${v}T00:00:00`)}`}
            options={DATES.map((d) => ({ id: dayBack(d.days), label: d.label }))}
            onPick={(v) => setFilter('after', v)}
          />
          <Chip name="Has" value={filterOf(q, 'has')} shown={(v) => HAS.find((h) => h.id === v)?.label ?? v} options={HAS} onPick={(v) => setFilter('has', v)} />
          <button
            type="button"
            aria-pressed={parsed.thread}
            onClick={() => setFilter('is', parsed.thread ? null : 'thread')}
            className={clsx(
              'sf-focus sf-small relative inline-flex h-8 cursor-pointer items-center gap-1 rounded-sf-full border px-3 font-medium max-md:h-11',
              parsed.thread ? 'border-sf-text bg-sf-text text-sf-surface' : 'border-sf-line-strong bg-sf-surface text-sf-text hover:bg-sf-surface-hover',
            )}
          >
            Only threads
            {parsed.thread && <Icon icon={IconX} size={16} />}
          </button>
        </div>
        <p className="sf-meta m-0 flex-none px-4 pt-2 pb-2 text-sf-text-muted sm:px-6">
          Try <code className="font-mono">from:@nour</code> · <code className="font-mono">has:file</code> · "quoted words"
        </p>
        <div id={panelId} role="tabpanel" aria-label={TABS.find((t) => t.id === tab)!.label} aria-busy={search.isFetching && !search.isFetchingNextPage} className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 sm:px-6">
          {resolved && resolved.problems.length > 0 ? (
            <div role="status" className="sf-ui px-2 py-6 text-sf-text-secondary">
              {resolved.problems.map((p) => (
                <p key={p} className="m-0">
                  {p}
                </p>
              ))}
            </div>
          ) : !request ? (
            <p className="sf-ui px-2 py-6 text-sf-text-muted">Type in the search box to look through messages, files, tasks, channels and people.</p>
          ) : search.isError && !pages ? (
            <div className="flex flex-col items-start gap-3 px-2 py-6">
              <p className="sf-ui m-0 text-sf-text-secondary">Search didn’t work.</p>
              <Button size="sm" onClick={() => void search.refetch()} disabled={search.isFetching}>
                {search.isFetching ? 'Trying…' : 'Try again'}
              </Button>
            </div>
          ) : !pages ? (
            <ul aria-hidden className="flex flex-col gap-3 py-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-24 animate-pulse rounded-sf-lg bg-sf-surface-hover" />
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="px-2 py-6">
              <p className="sf-ui m-0 text-sf-text-muted">{q.trim() ? `Nothing matches “${q.trim()}”.` : 'Nothing matches.'}</p>
              {filtered && (
                <div className="mt-3">
                  <Button size="sm" touch onClick={() => set({ q: parsed.words.concat(parsed.phrases.map((p) => `"${p}"`)).join(' ') })}>
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <ul aria-label={`${TABS.find((t) => t.id === tab)!.label} found`} className={clsx('m-0 list-none p-0', tab === 'messages' ? 'flex flex-col gap-3 py-2' : '')}>
                {items.map((hit) => (
                  <li key={keyOf(hit)}>
                    <HitRow hit={hit} q={parsed} ws={ws} placeOf={placeOf} people={people} meId={persona.id} workspaceId={workspace?.id ?? ''} navigate={navigate} params={params} setParams={setParams} />
                  </li>
                ))}
              </ul>
              {search.hasNextPage && (
                <div className="py-4">
                  <Button size="sm" touch disabled={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
                    {search.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * Phones: the query's own box under the header (the top bar has only a search button there). Enter searches; the
 * channel's 🔍, ⌘F and /search put the caret in it.
 */
function PhoneQuery({ q, onSearch }: { q: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(q)
  const [shown, setShown] = useState(q)
  if (q !== shown) {
    setShown(q)
    setText(q)
  }
  const box = useRef<HTMLInputElement>(null)
  useFocusOnArrival(box)
  return (
    <form
      role="search"
      className="relative flex-none px-4 pb-2 md:hidden"
      onSubmit={(event) => {
        event.preventDefault()
        onSearch(text)
      }}
    >
      <Icon icon={IconSearch} size={18} className="pointer-events-none absolute start-7 top-[22px] -translate-y-1/2 text-sf-text-muted" />
      <input
        ref={box}
        type="search"
        enterKeyHint="search"
        aria-label="Search messages and files"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search"
        className="h-11 w-full rounded-sf-md border border-sf-line bg-sf-surface-sunken ps-9 pe-3 text-[16px] text-sf-text outline-none placeholder:text-sf-text-muted focus:border-sf-focus focus:bg-sf-surface [&::-webkit-search-cancel-button]:hidden"
      />
    </form>
  )
}

const keyOf = (hit: SearchHit) =>
  hit.kind === 'message' ? `${hit.target.kind}:${hit.target.id}` : hit.kind === 'file' ? `f:${hit.file.id}` : hit.kind === 'task' ? `t:${hit.task.key}` : hit.kind === 'channel' ? `c:${hit.channel.id}` : `p:${hit.user.id}`

/** The In chip's choices: channels by name, then my 1:1 conversations by the other person. */
function inOptions(channels: Channel[], people: User[], meId: string) {
  const named = channels.filter((c) => c.kind === 'channel').map((c) => ({ id: `#${c.name}`, label: `#${c.name}` }))
  const dms = channels.flatMap((c) => {
    const other = c.kind === 'dm' && c.memberIds.length === 2 ? people.find((u) => u.id !== meId && c.memberIds.includes(u.id)) : undefined
    return other ? [{ id: `@${handleOf(other)}`, label: other.name }] : []
  })
  return [...named, ...dms]
}

/** A filter chip (spec 6.12): its menu sets it; while set it is inverted, says what, and × takes it off. */
function Chip({ name, value, shown, options, onPick }: { name: string; value: string | null; shown: (value: string) => string; options: { id: string; label: string }[]; onPick: (value: string | null) => void }) {
  const set = value !== null
  return (
    <span className={clsx('inline-flex h-8 items-center rounded-sf-full border max-md:h-11', set ? 'border-sf-text bg-sf-text text-sf-surface' : 'border-sf-line-strong bg-sf-surface text-sf-text')}>
      <Menu
        label={name}
        trigger={(props) => (
          <button type="button" aria-label={set ? `${name}: ${shown(value)}` : name} {...props} className={clsx('sf-focus sf-small inline-flex h-full cursor-pointer items-center gap-1 rounded-sf-full font-medium', set ? 'ps-3 pe-1' : 'px-3 hover:bg-sf-surface-hover')}>
            {set ? shown(value) : name}
            {!set && <Icon icon={IconChevronDown} size={16} />}
          </button>
        )}
      >
        <div className="max-h-72 overflow-y-auto">
          {options.map((o) => (
            <MenuItem key={o.id} checked={o.id === value} onSelect={() => onPick(o.id)}>
              {o.label}
            </MenuItem>
          ))}
        </div>
      </Menu>
      {set && (
        <button type="button" aria-label={`Remove ${name} filter`} title={`Remove ${name} filter`} onClick={() => onPick(null)} className="sf-focus relative me-1 inline-grid size-6 cursor-pointer place-items-center rounded-sf-full hover:bg-sf-text-secondary max-md:after:absolute max-md:after:-inset-2.5">
          <Icon icon={IconX} size={16} />
        </button>
      )}
    </span>
  )
}

const rowClass = 'sf-focus flex w-full items-center gap-3 border-b border-sf-line px-2 py-3 text-start hover:bg-sf-surface-hover'

function HitRow({
  hit,
  q,
  ws,
  placeOf,
  people,
  meId,
  workspaceId,
  navigate,
  params,
  setParams,
}: {
  hit: SearchHit
  q: ReturnType<typeof parseQuery>
  ws: string
  placeOf: (channelId: string) => string
  people: User[]
  meId: string
  workspaceId: string
  navigate: ReturnType<typeof useNavigate>
  params: URLSearchParams
  setParams: ReturnType<typeof useSearchParams>[1]
}) {
  const openDm = useOpenDm()
  const [failed, setFailed] = useState(false)
  switch (hit.kind) {
    case 'message':
      return <SearchResultCard hit={hit} query={q} place={placeOf(hit.channelId)} author={senderName(hit.senderId, people)} ws={ws} />
    case 'file':
      return (
        <button type="button" className={rowClass} onClick={() => setParams(withInspector(params, { kind: 'file', fileId: hit.file.id }))}>
          <span aria-hidden className="grid size-10 flex-none place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
            <Icon icon={IconFile} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{hit.file.title}</span>
            <span className="sf-meta block truncate text-sf-text-muted">
              {sizeText(hit.file.size)} · {senderName(hit.senderId, people)} in {placeOf(hit.channelId)} · {formatWhen(hit.at)}
            </span>
          </span>
        </button>
      )
    case 'task':
      return (
        <Link to={{ search: withInspector(params, { kind: 'ticket', key: hit.task.key }).toString() }} className={rowClass}>
          <Icon icon={IconListCheck} className="flex-none text-sf-text-secondary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{hit.task.title}</span>
            <span className="sf-meta block truncate text-sf-text-muted">
              <bdi dir="ltr" className="font-mono">
                {hit.task.key}
              </bdi>{' '}
              · {hit.task.statusLabel} · {hit.task.projectName}
            </span>
          </span>
        </Link>
      )
    case 'channel':
      return (
        <Link to={paths.channel(ws, hit.channel.id)} className={rowClass}>
          <Icon icon={hit.channel.isPrivate ? IconLock : IconHash} className="flex-none text-sf-text-secondary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{hit.channel.name}</span>
            <span className="sf-meta block truncate text-sf-text-muted">{hit.channel.topic || '—'}</span>
          </span>
        </Link>
      )
    case 'person':
      if (hit.user.id === meId)
        return (
          <div className={rowClass.replace('sf-focus ', '').replace(' hover:bg-sf-surface-hover', '')}>
            <Avatar id={hit.user.id} name={hit.user.name} decorative />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{hit.user.name} (you)</span>
              <span className="sf-meta block truncate text-sf-text-muted">{hit.user.title || '—'}</span>
            </span>
          </div>
        )
      return (
        <>
          <button
            type="button"
            className={rowClass}
            disabled={openDm.isPending}
            onClick={() =>
              openDm.mutate(
                { workspaceId, userIds: [hit.user.id] },
                { onSuccess: (dm) => navigate(paths.channel(ws, dm.id)), onError: () => setFailed(true) },
              )
            }
          >
            <Avatar id={hit.user.id} name={hit.user.name} decorative />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">
                {hit.user.name}
              </span>
              <span className="sf-meta block truncate text-sf-text-muted">{hit.user.title || '—'}</span>
            </span>
          </button>
          {failed && <p className="sf-small m-0 px-2 py-1 text-sf-error">Couldn’t open the conversation. Try again.</p>}
        </>
      )
  }
}
