import clsx from 'clsx'
import { Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Attachment } from '@/api/types'
import { acceptedFiles, allowedFilesHint, sizeText } from '@/lib/fileTypes'
import { fileIcon } from './fileSources'
import { rowLabel, type UploadRow } from './uploadQueue'

/**
 * A task's files in its sheet (spec 5.1): one row per file with × to take it off (nothing is saved until Save), one row
 * per upload (Cancel, Try again, dismiss), and a dashed box that takes dropped or picked files. Read-only for someone
 * who may only move the task: the files, nothing to add or remove.
 */
export function TaskAttachments({
  files,
  rows,
  readOnly,
  onAdd,
  onRemove,
  onCancel,
  onRetry,
  onDismiss,
  canRetry,
}: {
  files: Attachment[]
  rows: UploadRow[]
  readOnly: boolean
  onAdd: (files: FileList | File[]) => void
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onDismiss: (id: string) => void
  canRetry: (id: string) => boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const empty = files.length === 0 && rows.length === 0

  return (
    <section aria-label="Attachments">
      <h3 className="mb-1.5 block text-sm font-medium text-fg-secondary">Attachments</h3>
      {empty && readOnly && <p className="text-sm text-fg-muted">—</p>}
      {!empty && (
        <ul className="mb-2 divide-y divide-line-subtle rounded-lg border border-line">
          {files.map((f) => {
            const Icon = fileIcon(f)
            return (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2">
              <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{f.title}</span>
                <span className="block text-xs text-fg-muted tabular-nums">{sizeText(f.size)}</span>
              </span>
              {!readOnly && (
                <button type="button" onClick={() => onRemove(f.id)} aria-label={`Remove ${f.title}`} className="rounded-md p-1 text-fg-tertiary hover:text-fg">
                  <X className="size-4" />
                </button>
              )}
            </li>
            )
          })}
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2" aria-live="polite">
              <Upload className="size-4 shrink-0 text-fg-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{r.name}</span>
                <span className={clsx('block truncate text-xs tabular-nums', r.state === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-fg-muted')}>{rowLabel(r)}</span>
              </span>
              {(r.state === 'queued' || r.state === 'uploading') && (
                <button type="button" onClick={() => onCancel(r.id)} className="text-sm font-medium text-fg-secondary hover:text-fg">
                  Cancel
                </button>
              )}
              {(r.state === 'failed' || r.state === 'cancelled') && canRetry(r.id) && (
                <button type="button" onClick={() => onRetry(r.id)} className="text-sm font-medium text-accent hover:text-accent-strong">
                  Try again
                </button>
              )}
              {(r.state === 'failed' || r.state === 'cancelled') && (
                <button type="button" onClick={() => onDismiss(r.id)} aria-label={`Dismiss ${r.name}`} className="rounded-md p-1 text-fg-tertiary hover:text-fg">
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            onAdd(e.dataTransfer.files)
          }}
          className={clsx('rounded-lg border border-dashed p-4 text-center text-sm', dragging ? 'border-brand-500 bg-accent-soft' : 'border-line-strong')}
        >
          <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 font-medium text-accent hover:text-accent-strong">
            <Upload className="size-4" aria-hidden /> Add files
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
              if (e.target.files) onAdd([...e.target.files])
              e.target.value = ''
            }}
          />
        </div>
      )}
    </section>
  )
}
