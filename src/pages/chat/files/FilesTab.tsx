import { IconChevronDown, IconCode, IconFile, IconFileText, IconFileTypePdf, IconMovie, IconPhoto, type TablerIcon } from '@tabler/icons-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useChannelFiles } from '@/api/files'
import type { Attachment, Channel, ChannelFile, User } from '@/api/types'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { senderName } from '@/lib/flowbot'
import { fileKind, sizeText, type FileKind } from '@/lib/fileTypes'
import { formatWhen } from '@/lib/format'
import { useFileActions } from '@/pages/chat/files/FileActions'
import { snippetLabel } from '@/pages/chat/snippets/SnippetCard'

/** What the Files tab is narrowed to; `date` is turned into `since` when it's asked for. */
export type FilesFilter = { type?: FileKind; from?: string; date?: FilesDate; folderId?: string }
export type FilesDate = 'today' | 'week' | 'month'

const TYPES: { id: FileKind; label: string; icon: TablerIcon }[] = [
  { id: 'image', label: 'Images', icon: IconPhoto },
  { id: 'pdf', label: 'PDFs', icon: IconFileTypePdf },
  { id: 'document', label: 'Documents', icon: IconFileText },
  { id: 'snippet', label: 'Snippets', icon: IconCode },
  { id: 'video', label: 'Videos', icon: IconMovie },
  { id: 'other', label: 'Other', icon: IconFile },
]
const DATES: { id: FilesDate; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' },
]

/** Where a date filter starts: local midnight today, or 7 or 30 days back. */
export function filesSince(date: FilesDate | undefined, now: Date): string | undefined {
  if (!date) return undefined
  const days = { today: 0, week: 7, month: 30 }[date]
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).toISOString()
}

/** "PDF · 184 KB", or "SQL snippet · 900 B". */
const subline = (file: Attachment) => {
  const kind = file.snippet ? snippetLabel(file) : file.name.includes('.') ? file.name.split('.').pop()!.toUpperCase() : 'File'
  return `${kind} · ${sizeText(file.size)}`
}

function Filter<T extends string>({ name, any, options, value, onPick }: { name: string; any: string; options: { id: T; label: string }[]; value: T | undefined; onPick: (value: T | undefined) => void }) {
  const picked = options.find((o) => o.id === value)?.label ?? any
  return (
    <Menu
      label={name}
      trigger={(props) => (
        <button
          type="button"
          aria-label={`${name}: ${picked}`}
          {...props}
          className={
            'sf-focus sf-small inline-flex h-8 cursor-pointer items-center gap-1 rounded-sf-full border px-3 font-medium max-md:h-11 ' +
            (value ? 'border-sf-text bg-sf-text text-sf-surface' : 'border-sf-line-strong bg-sf-surface text-sf-text hover:bg-sf-surface-hover')
          }
        >
          {value ? picked : name}
          <Icon icon={IconChevronDown} size={16} />
        </button>
      )}
    >
      <MenuItem checked={value === undefined} onSelect={() => onPick(undefined)}>
        {any}
      </MenuItem>
      {options.map((o) => (
        <MenuItem key={o.id} checked={o.id === value} onSelect={() => onPick(o.id)}>
          {o.label}
        </MenuItem>
      ))}
    </Menu>
  )
}

/**
 * The channel's Files tab (spec 6.1): every file shared in it, newest first, narrowed by Type, Person and Date (chips
 * that invert while set). Each row opens the file's details; Load more brings the next 50.
 */
export function FilesTab({
  items,
  people,
  filter,
  hasMore,
  loadingMore,
  onFilter,
  onMore,
  onOpen,
  extraFilters,
}: {
  items: ChannelFile[]
  people: User[]
  filter: FilesFilter
  hasMore: boolean
  loadingMore: boolean
  onFilter: (filter: FilesFilter) => void
  onMore: () => void
  onOpen: (file: Attachment) => void
  /** More chips after Date (Folder). */
  extraFilters?: ReactNode
}) {
  const set = <K extends keyof FilesFilter>(key: K, value: FilesFilter[K]) => {
    const next = { ...filter, [key]: value }
    if (value === undefined) delete next[key]
    onFilter(next)
  }
  const filtered = Object.keys(filter).length > 0
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="group" aria-label="Filters" className="flex flex-none flex-wrap items-center gap-2 border-b border-sf-line px-4 py-3 sm:px-6">
        <Filter name="Type" any="Any type" options={TYPES} value={filter.type} onPick={(v) => set('type', v)} />
        <Filter name="Person" any="Anyone" options={people.map((p) => ({ id: p.id, label: p.name }))} value={filter.from} onPick={(v) => set('from', v)} />
        <Filter name="Date" any="Any time" options={DATES} value={filter.date} onPick={(v) => set('date', v)} />
        {extraFilters}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="sf-ui px-6 py-8 text-sf-text-muted">
            {filtered ? (
              <>
                <p className="m-0">No files match these filters.</p>
                <div className="mt-3">
                  <Button size="sm" touch onClick={() => onFilter({})}>
                    Clear filters
                  </Button>
                </div>
              </>
            ) : (
              <p className="m-0">No files have been shared in this channel yet.</p>
            )}
          </div>
        ) : (
          <ul aria-label="Files" className="m-0 list-none p-0">
            {items.map(({ file, senderId, at, messageId, replyId }) => {
              const type = TYPES.find((t) => t.id === fileKind(file))!
              return (
                <li key={`${file.id}:${replyId ?? messageId}`} className="border-b border-sf-line">
                  <button
                    type="button"
                    aria-label={`Open ${file.title}: ${subline(file)}, ${senderName(senderId, people)} · ${formatWhen(at)}`}
                    onClick={() => onOpen(file)}
                    className="sf-focus flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-sf-surface-hover sm:px-6">
                    <span aria-hidden className="grid size-10 flex-none place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
                      <Icon icon={type.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{file.title}</span>
                      <span className="sf-small block truncate text-sf-text-secondary">{subline(file)}</span>
                      <span className="sf-meta block truncate text-sf-text-muted">
                        {senderName(senderId, people)} · {formatWhen(at)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {hasMore && (
          <div className="px-6 py-4">
            <Button size="sm" touch disabled={loadingMore} onClick={onMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** The Files tab as the channel shows it: its files, live, filtered, each opening the File details panel. */
export function ChannelFiles({ channel, users }: { channel: Channel; users: User[] }) {
  const [filter, setFilter] = useState<FilesFilter>({})
  // The day's start is worked out once per filter change, so the query key holds still.
  const since = useMemo(() => filesSince(filter.date, new Date()), [filter.date])
  const files = useChannelFiles(channel.id, { type: filter.type, from: filter.from, since, folderId: filter.folderId })
  const actions = useFileActions()
  const people = useMemo(() => users.filter((u) => channel.memberIds.includes(u.id)), [users, channel.memberIds])
  if (files.isError)
    return (
      <p className="sf-ui px-6 py-8 text-sf-error">
        The files couldn’t be loaded.{' '}
        <button type="button" className="sf-focus font-medium underline" onClick={() => void files.refetch()}>
          Try again
        </button>
      </p>
    )
  if (!files.data) return <div aria-hidden className="mx-6 my-6 h-24 animate-pulse rounded-sf-lg bg-sf-surface-hover" />
  return (
    <FilesTab
      items={files.data.pages.flatMap((p) => p.items)}
      people={people}
      filter={filter}
      hasMore={files.hasNextPage}
      loadingMore={files.isFetchingNextPage}
      onFilter={setFilter}
      onMore={() => void files.fetchNextPage()}
      onOpen={(file) => actions?.details(file)}
    />
  )
}
