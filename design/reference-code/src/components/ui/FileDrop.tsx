import clsx from 'clsx'
import { Check, FileUp, X } from 'lucide-react'
import { useId, useState, type DragEvent } from 'react'
import { acceptedFiles, isAcceptedFile, maxFileMb } from '../../lib/fileTypes'
import type { UploadState } from '../../lib/useUploads'

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/**
 * Pick or drag in one or more files. Types and sizes the API would refuse are left out, with a line saying why.
 * While saving, each file shows a progress line (`progress`, from useUploads).
 */
export function FileDrop({
  files,
  onFiles,
  progress,
  label = 'Drag files here, or click to choose',
  multiple = true,
}: {
  files: File[]
  onFiles: (files: File[]) => void
  progress?: Map<File, UploadState>
  label?: string
  multiple?: boolean
}) {
  const busy = progress ? [...progress.values()].some((state) => typeof state === 'number') : false
  const inputId = useId()
  const [over, setOver] = useState(false)
  const [refused, setRefused] = useState<string[]>([])

  const add = (picked: File[]) => {
    const ok = picked.filter((file) => isAcceptedFile(file.name) && file.size <= maxFileMb * 1024 * 1024)
    setRefused(
      picked
        .filter((file) => !ok.includes(file))
        .map((file) => (isAcceptedFile(file.name) ? `${file.name} is over ${maxFileMb} MB.` : `${file.name}: this type of file can't be added.`)),
    )
    if (!ok.length) return
    if (!multiple) return onFiles(ok.slice(0, 1))
    // Picking the same file twice adds it once.
    const known = new Set(files.map((file) => `${file.name}|${file.size}|${file.lastModified}`))
    onFiles([...files, ...ok.filter((file) => !known.has(`${file.name}|${file.size}|${file.lastModified}`))])
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    add(Array.from(event.dataTransfer.files))
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={clsx(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-center text-sm transition-colors',
          over ? 'border-brand-500 bg-brand-500/5' : 'border-line-strong hover:bg-surface-sunken',
        )}
      >
        <FileUp className={clsx('size-6', over ? 'text-brand-500' : 'text-fg-muted')} />
        <span className="text-fg-secondary">{over ? 'Drop to add' : label}</span>
        <input
          id={inputId}
          type="file"
          multiple={multiple}
          accept={acceptedFiles}
          className="sr-only"
          onChange={(event) => {
            add(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="divide-y divide-line-subtle rounded-lg border border-line">
          {files.map((file, index) => (
            <FileRow key={`${file.name}-${index}`} file={file} state={progress?.get(file)} onRemove={busy ? undefined : () => onFiles(files.filter((_, at) => at !== index))} />
          ))}
        </ul>
      )}
      {refused.map((line) => (
        <p key={line} className="text-xs text-red-600 dark:text-red-400">
          {line}
        </p>
      ))}
    </div>
  )
}

function FileRow({ file, state, onRemove }: { file: File; state?: UploadState; onRemove?: () => void }) {
  const sending = typeof state === 'number'
  // Small files reach the server at once and then wait while it saves, so between 0 and the end the bar pulses.
  const waiting = sending && (state === 0 || state >= 0.99)
  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
        <span className={clsx('shrink-0 text-xs', state === 'failed' ? 'text-red-600 dark:text-red-400' : state === 'done' ? 'text-green-700 dark:text-green-400' : 'text-fg-muted')}>
          {state === 'done' ? 'Saved' : state === 'failed' ? 'Not saved' : sending ? (waiting ? 'Saving…' : `${Math.round(state * 100)}%`) : sizeText(file.size)}
        </span>
        {state === 'done' ? (
          <Check className="size-4 shrink-0 text-green-700 dark:text-green-400" />
        ) : (
          onRemove && (
            <button type="button" onClick={onRemove} className="rounded p-1 text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label={`Remove ${file.name}`}>
              <X className="size-4" />
            </button>
          )
        )}
      </div>
      {state !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={`${file.name} upload`} aria-valuenow={sending ? Math.round(state * 100) : state === 'done' ? 100 : 0}>
          <div
            className={clsx('h-full rounded-full transition-[width] duration-200', state === 'failed' ? 'bg-red-500' : state === 'done' ? 'bg-green-600' : 'bg-brand-500', waiting && 'animate-pulse')}
            style={{ width: `${sending && !waiting ? Math.max(4, state * 100) : 100}%` }}
          />
        </div>
      )}
    </li>
  )
}
