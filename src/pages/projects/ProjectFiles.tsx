import clsx from 'clsx'
import { FileText, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { noteDownload } from '@/api/audit'
import { openFile, useProjectFiles, useRemoveFile, useUploadFile } from '@/api/projects'
import type { StoredFile, User } from '@/api/types'
import { useMe } from '@/api/users'
import { ConfirmDeleteSheet } from '@/components/ConfirmDeleteSheet'
import { RowMenu } from '@/components/RowMenu'
import { Card, CardHeader } from '@/components/ui/Card'
import { FileViewer } from '@/components/ui/FileViewer'
import { acceptedFiles, sizeText } from '@/lib/fileTypes'
import { FileTypesHint } from './FileTypesHint'
import { timeAgo } from '@/lib/format'
import { rowLabel, uploadProgress } from './uploadQueue'
import { useUploadQueue } from './useUploadQueue'
import { IconButton } from '@/components/ui/IconButton'


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
  const [viewing, setViewing] = useState<{ id: string; name: string; url: string; sizeKb: number } | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<StoredFile | null>(null)
  // Dropped files go up one at a time; a finished one leaves the queue and shows in the list (filesChanged).
  const queue = useUploadQueue((file, { signal }) => upload.mutateAsync({ projectId, file, signal }), () => {})
  const { rows, busy } = queue

  const show = async (f: StoredFile) => {
    setOpenError(null)
    try {
      const url = await openFile(f.attachment.id)
      setViewing({ id: f.attachment.id, name: f.attachment.name, url, sizeKb: Math.round(f.attachment.size / 1024) })
    } catch {
      setOpenError(`${f.attachment.name} couldn’t be opened. Try again.`)
    }
  }
  const close = () => {
    if (viewing) URL.revokeObjectURL(viewing.url)
    setViewing(null)
  }
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? 'Someone'

  return (
    <Card>
      <CardHeader title="Files" />
      <div className="space-y-3 p-5">
        {files.isPending ? (
          <div className="h-12 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
        ) : files.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">Files couldn’t be loaded.</p>
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
              <li key={r.id} className="flex items-center gap-3 py-2">
                <Upload className="size-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{r.name}</span>
                  <span className={clsx('block truncate text-xs', r.state === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-fg-muted')} {...uploadProgress(r)}>
                    {rowLabel(r)}
                  </span>
                </span>
                {(r.state === 'queued' || r.state === 'uploading') && (
                  <button type="button" onClick={() => queue.cancel(r.id)} className="text-sm font-medium text-fg-secondary hover:text-fg">
                    Cancel
                  </button>
                )}
                {(r.state === 'failed' || r.state === 'cancelled') && queue.canRetry(r.id) && (
                  <button type="button" onClick={() => queue.retry(r.id)} className="text-sm font-medium text-accent hover:text-accent-strong">
                    Try again
                  </button>
                )}
                {(r.state === 'failed' || r.state === 'cancelled') && (
                  <IconButton label={`Dismiss ${r.name}`} icon={X} size="sm" onClick={() => queue.dismiss(r.id)} />
                )}
              </li>
            ))}
          </ul>
        )}
        {/* What finished or failed, read once (UX Phase 5A, 5.12). */}
        <p role="status" className="sr-only">
          {queue.notice}
        </p>
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
              queue.add(e.dataTransfer.files)
            }}
            className={clsx('rounded-lg border border-dashed p-4 text-center text-sm', dragging ? 'border-brand-500 bg-accent-soft' : 'border-line-strong')}
          >
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 font-medium text-accent hover:text-accent-strong">
              <Upload className="size-4" /> {busy ? 'Add more files' : 'Add files'}
            </button>
            <span className="text-fg-muted"> or drop them here</span>
            <FileTypesHint />
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={acceptedFiles}
              hidden
              onChange={(e) => {
                queue.add(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        )}
      </div>
      {viewing && <FileViewer files={[viewing]} onClose={close} onDownload={() => noteDownload(viewing.id)} />}
      <ConfirmDeleteSheet
        open={removing !== null}
        title={`Remove ${removing?.attachment.name ?? 'file'}?`}
        description="It’s removed for everyone on the project."
        actionLabel="Remove file"
        pendingLabel="Removing…"
        onConfirm={() => remove.mutateAsync({ projectId: removing!.projectId, fileId: removing!.attachmentId })}
        onClose={() => setRemoving(null)}
      />
    </Card>
  )
}
