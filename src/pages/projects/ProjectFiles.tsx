import clsx from 'clsx'
import { FileText, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { openFile, useProjectFiles, useRemoveFile, useUploadFile } from '@/api/projects'
import type { StoredFile, User } from '@/api/types'
import { useMe } from '@/api/users'
import { ConfirmDeleteSheet } from '@/components/ConfirmDeleteSheet'
import { RowMenu } from '@/components/RowMenu'
import { Card, CardHeader } from '@/components/ui/Card'
import { FileViewer } from '@/components/ui/FileViewer'
import { acceptFiles, acceptedFiles, allowedFilesHint } from '@/lib/fileTypes'
import { timeAgo } from '@/lib/format'
import { queueRows, rowLabel, type UploadRow } from './uploadQueue'

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** Why a file can't be added (the same rules as the server), or null. */
const refusal = (file: File) => acceptFiles([], [file]).refused[0] ?? null

/**
 * The project's files: a list that opens each in the viewer, and a drop zone for people who can post. Dropped files go
 * up one at a time, each with its own row (Cancel, Try again). Whoever added a file, the manager and Admins remove it.
 */
export function ProjectFiles({ projectId, people, canUpload, canManage }: { projectId: string; people: User[]; canUpload: boolean; canManage: boolean }) {
  const files = useProjectFiles(projectId)
  const upload = useUploadFile()
  const remove = useRemoveFile()
  const meId = useMe().data?.id
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [viewing, setViewing] = useState<{ name: string; url: string; sizeKb: number } | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<StoredFile | null>(null)
  const [rows, setRows] = useState<UploadRow[]>([])
  // A row's file and its Cancel, kept for Try again; the ids waiting their turn; whether one is on its way.
  const jobs = useRef(new Map<string, { file: File; controller: AbortController }>())
  const queue = useRef<string[]>([])
  const running = useRef(false)

  const setRow = (id: string, patch: Partial<UploadRow>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const drop = (id: string) => {
    jobs.current.delete(id)
    setRows((all) => all.filter((r) => r.id !== id))
  }
  const pump = async () => {
    if (running.current) return
    running.current = true
    for (let id = queue.current.shift(); id; id = queue.current.shift()) {
      const job = jobs.current.get(id)
      if (!job || job.controller.signal.aborted) continue
      setRow(id, { state: 'uploading', error: null })
      try {
        await upload.mutateAsync({ projectId, file: job.file, signal: job.controller.signal })
        drop(id)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') setRow(id, { state: 'cancelled' })
        else setRow(id, { state: 'failed', error: (error as Error).message || "Couldn't upload." })
      }
    }
    running.current = false
  }
  const start = (id: string, file: File) => {
    jobs.current.set(id, { file, controller: new AbortController() })
    queue.current.push(id)
  }
  const send = (list: FileList | null) => {
    const picked = [...(list ?? [])]
    if (picked.length === 0) return
    const added = queueRows(picked, refusal)
    setRows((all) => [...all, ...added])
    added.forEach((row, i) => row.state === 'queued' && start(row.id, picked[i]!))
    void pump()
  }
  const cancel = (id: string) => {
    jobs.current.get(id)?.controller.abort()
    queue.current = queue.current.filter((q) => q !== id)
    setRow(id, { state: 'cancelled' })
  }
  const retry = (id: string) => {
    const job = jobs.current.get(id)
    if (!job) return
    start(id, job.file)
    setRow(id, { state: 'queued', error: null })
    void pump()
  }

  const show = async (f: StoredFile) => {
    setOpenError(null)
    try {
      const url = await openFile(f.attachment.id)
      setViewing({ name: f.attachment.name, url, sizeKb: Math.round(f.attachment.size / 1024) })
    } catch {
      setOpenError(`${f.attachment.name} couldn't be opened. Try again.`)
    }
  }
  const close = () => {
    if (viewing) URL.revokeObjectURL(viewing.url)
    setViewing(null)
  }
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? 'Someone'
  const busy = rows.some((r) => r.state === 'queued' || r.state === 'uploading')

  return (
    <Card>
      <CardHeader title="Files" />
      <div className="space-y-3 p-5">
        {files.isPending ? (
          <div className="h-12 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
        ) : files.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">Files couldn't be loaded.</p>
        ) : files.data.length === 0 && rows.length === 0 ? (
          <p className="text-sm text-fg-muted">No files yet.</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {files.data.map((f) => (
              <li key={f.id} className="flex items-center gap-2">
                <button type="button" onClick={() => void show(f)} className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-2 text-start hover:bg-surface-muted">
                  <FileText className="size-4 shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{f.attachment.name}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {sizeText(f.attachment.size)} · {nameOf(f.uploadedBy)} · {timeAgo(f.createdAt)}
                    </span>
                  </span>
                </button>
                {/* Not on a frozen (archived) project, where nobody can post: canUpload says so. */}
                {canUpload && (canManage || f.uploadedBy === meId) && (
                  <RowMenu label={`Actions for ${f.attachment.name}`} items={[{ label: 'Remove file', icon: Trash2, danger: true, onSelect: () => setRemoving(f) }]} />
                )}
              </li>
            ))}
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2" aria-live="polite">
                <Upload className="size-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{r.name}</span>
                  <span className={clsx('block truncate text-xs', r.state === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-fg-muted')}>{rowLabel(r)}</span>
                </span>
                {(r.state === 'queued' || r.state === 'uploading') && (
                  <button type="button" onClick={() => cancel(r.id)} className="text-sm font-medium text-fg-secondary hover:text-fg">
                    Cancel
                  </button>
                )}
                {(r.state === 'failed' || r.state === 'cancelled') && jobs.current.has(r.id) && (
                  <button type="button" onClick={() => retry(r.id)} className="text-sm font-medium text-accent hover:text-accent-strong">
                    Try again
                  </button>
                )}
                {(r.state === 'failed' || r.state === 'cancelled') && (
                  <button type="button" onClick={() => drop(r.id)} aria-label={`Dismiss ${r.name}`} className="rounded-md p-1 text-fg-tertiary hover:text-fg">
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {openError && <p className="text-sm text-red-600 dark:text-red-400">{openError}</p>}

        {canUpload && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              send(e.dataTransfer.files)
            }}
            className={clsx('rounded-lg border border-dashed p-4 text-center text-sm', dragging ? 'border-brand-500 bg-accent-soft' : 'border-line-strong')}
          >
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 font-medium text-accent hover:text-accent-strong">
              <Upload className="size-4" /> {busy ? 'Add more files' : 'Add files'}
            </button>
            <span className="text-fg-muted"> or drop them here</span>
            <p className="mt-1 text-xs text-fg-muted">{allowedFilesHint}</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={acceptedFiles}
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                send(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        )}
      </div>
      {viewing && <FileViewer files={[viewing]} onClose={close} />}
      <ConfirmDeleteSheet
        open={removing !== null}
        title={`Remove ${removing?.attachment.name ?? 'file'}?`}
        description="It's removed for everyone on the project."
        actionLabel="Remove file"
        pendingLabel="Removing…"
        onConfirm={() => remove.mutateAsync({ projectId: removing!.projectId, fileId: removing!.attachmentId })}
        onClose={() => setRemoving(null)}
      />
    </Card>
  )
}
