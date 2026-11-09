import clsx from 'clsx'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { noteDownload } from '@/api/audit'
import { openFile, useAllProjectFiles } from '@/api/projects'
import type { Attachment, ProjectFileRow, ProjectFileSource, ProjectSummary, User } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/Button'
import { DataTable, TableSkeleton, type Column } from '@/components/ui/DataTable'
import { selectClass } from '@/components/ui/Field'
import { FileViewer } from '@/components/ui/FileViewer'
import { QueryError } from '@/components/ui/QueryError'
import { sizeText } from '@/lib/fileTypes'
import { formatDate } from '@/lib/format'
import { withInspector } from '@/lib/inspector'
import { paths } from '@/lib/paths'
import { FROM_CHIPS, TYPE_OPTIONS, fileIcon, filterOf, sourceLabel, typeLabel } from './fileSources'

/** A file that can't be opened yet, and why: still being checked, or blocked. */
const notReady = (file: Attachment) => (file.scanStatus === 'pending' ? 'Being checked' : file.scanStatus === 'blocked' ? 'Blocked' : null)

/**
 * A project's Files tab (spec 5.3): every file of the project once, newest first, 50 at a time, with where each came
 * from. Chips (`?from=`) and a type (`?type=`) narrow it. A row opens the file in the viewer; From goes to the task
 * panel, the message in Chat, or Overview.
 */
export function FilesTab({ ws, project, users }: { ws: string; project: ProjectSummary; users: User[] }) {
  const [params, setParams] = useSearchParams()
  const filter = filterOf(params)
  const list = useAllProjectFiles(project.id, filter)
  const rows = list.data?.pages.flatMap((p) => p.items) ?? []
  const [viewing, setViewing] = useState<{ id: string; name: string; url: string; sizeKb: number } | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  const setFilter = (key: 'from' | 'type', value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!value || value === 'all') next.delete(key)
        else next.set(key, value)
        return next
      },
      // A choice is a step Back undoes (UX Phase 2, 2.7).
      { replace: false },
    )
  const clear = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('from')
        next.delete('type')
        return next
      },
      // A choice is a step Back undoes (UX Phase 2, 2.7).
      { replace: false },
    )
  const open = async ({ file }: ProjectFileRow) => {
    if (notReady(file)) return
    setOpenError(null)
    try {
      const url = await openFile(file.id)
      setViewing({ id: file.id, name: file.name, url, sizeKb: Math.round(file.size / 1024) })
    } catch {
      setOpenError(`${file.title} couldn’t be opened. Try again.`)
    }
  }
  const close = () => {
    if (viewing) URL.revokeObjectURL(viewing.url)
    setViewing(null)
  }
  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? 'Someone'
  const hrefOf = (source: ProjectFileSource) => {
    if (source.kind === 'task' || source.kind === 'comment') return `${paths.project(ws, project.key, 'files')}?${withInspector(params, { kind: 'ticket', key: source.taskKey })}`
    if (source.kind === 'chat') return `${paths.project(ws, project.key, 'chat')}?message=${encodeURIComponent(source.messageId)}`
    return paths.project(ws, project.key, 'overview')
  }
  const from = (source: ProjectFileSource) => (
    // A link inside a clickable row: it goes where it says, it doesn't open the file.
    <Link to={hrefOf(source)} onClick={(e) => e.stopPropagation()} className="truncate text-accent hover:underline">
      {sourceLabel(source)}
    </Link>
  )
  const title = ({ file }: ProjectFileRow) => {
    const Icon = fileIcon(file)
    return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
      <span className={clsx('truncate', notReady(file) ? 'text-fg-muted' : 'font-medium text-fg')}>{file.title}</span>
      {notReady(file) && <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg-muted">{notReady(file)}</span>}
    </span>
    )
  }

  const columns: Column<ProjectFileRow>[] = [
    { id: 'name', header: 'Name', width: 300, cell: title },
    { id: 'type', header: 'Type', width: 80, cell: (r) => <span className="text-fg-secondary">{typeLabel(r.file)}</span> },
    { id: 'size', header: 'Size', width: 90, align: 'right', cell: (r) => <span className="tabular-nums text-fg-secondary">{sizeText(r.file.size)}</span> },
    {
      id: 'by',
      header: 'Uploaded by',
      width: 180,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={nameOf(r.file.uploadedBy)} size={24} decorative />
          <span className="truncate text-fg-secondary">{nameOf(r.file.uploadedBy)}</span>
        </span>
      ),
    },
    { id: 'at', header: 'Uploaded', width: 120, cell: (r) => <span className="tabular-nums text-fg-secondary">{formatDate(r.file.createdAt)}</span> },
    { id: 'from', header: 'From', width: 170, cell: (r) => from(r.source) },
  ]

  const chip = (active: boolean) =>
    clsx('shrink-0 rounded-full border px-3 py-1.5 text-sm', active ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-secondary hover:bg-surface-muted')
  const filtered = Boolean(filter.from || filter.type)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="From">
          {FROM_CHIPS.map(([value, label]) => {
            const active = (filter.from ?? 'all') === value
            return (
              <button key={value} type="button" aria-pressed={active} onClick={() => setFilter('from', value)} className={chip(active)}>
                {label}
              </button>
            )
          })}
        </div>
        <div className="w-full sm:w-44">
          <select aria-label="Type" className={selectClass} value={filter.type ?? ''} onChange={(e) => setFilter('type', e.target.value)}>
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {list.isError && !list.data ? (
        <QueryError what="Files" onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <div aria-busy="true">
          <TableSkeleton rows={5} />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {filtered ? (
            <>
              No files match these filters.{' '}
              <button type="button" onClick={clear} className="font-medium text-accent hover:text-accent-strong">
                Clear filters
              </button>
            </>
          ) : (
            'No files yet. Files added to tasks, comments, chat and Overview show here.'
          )}
        </p>
      ) : (
        <>
          <div className="max-sm:hidden">
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.file.id} onRowClick={(r) => void open(r)} storageKey="spark-flow.table.projectFiles" label="Project files" />
          </div>
          <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface sm:hidden">
            {rows.map((r) => (
              <li key={r.file.id} className="px-4 py-3">
                <button type="button" onClick={() => void open(r)} disabled={Boolean(notReady(r.file))} className="block w-full min-w-0 text-start text-sm">
                  {title(r)}
                  <span className="mt-0.5 block truncate text-xs text-fg-muted tabular-nums">
                    {typeLabel(r.file)} · {sizeText(r.file.size)} · {nameOf(r.file.uploadedBy)} · {formatDate(r.file.createdAt)}
                  </span>
                </button>
                <span className="mt-0.5 flex min-w-0 gap-1 text-xs text-fg-muted">From {from(r.source)}</span>
              </li>
            ))}
          </ul>
          {list.hasNextPage && (
            <Button variant="secondary" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
              {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </>
      )}
      {openError && <p className="text-sm text-red-600 dark:text-red-400">{openError}</p>}
      {viewing && <FileViewer files={[viewing]} onClose={close} onDownload={() => noteDownload(viewing.id)} />}
    </div>
  )
}
