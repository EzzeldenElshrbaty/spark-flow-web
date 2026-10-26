import clsx from 'clsx'
import { FileUp, X } from 'lucide-react'
import { useId, useState, type DragEvent } from 'react'
import { acceptedFiles, acceptFiles } from '@/lib/fileTypes'

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/**
 * Pick or drag in one or more files. Types and sizes the API would refuse are left out, with a line saying why.
 * Copied from Spark CRM's FileDrop without the upload-progress rows (Spark Flow sends the files with the form).
 */
export function FileDrop({
  files,
  onFiles,
  label = 'Drag files here, or click to choose',
  multiple = true,
  max,
}: {
  files: File[]
  onFiles: (files: File[]) => void
  label?: string
  multiple?: boolean
  /** At most this many files; past it, a sentence says so. */
  max?: number
}) {
  const inputId = useId()
  const [over, setOver] = useState(false)
  const [refused, setRefused] = useState<string[]>([])

  const add = (picked: File[]) => {
    const { files: next, refused: why } = acceptFiles(multiple ? files : [], multiple ? picked : picked.slice(0, 1), multiple ? max : 1)
    setRefused(why)
    if (next.length !== files.length || !multiple) onFiles(next)
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
            <FileRow key={`${file.name}-${index}`} file={file} onRemove={() => onFiles(files.filter((_, at) => at !== index))} />
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

function FileRow({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
        <span className="shrink-0 text-xs text-fg-muted">{sizeText(file.size)}</span>
        <button type="button" onClick={onRemove} className="rounded p-1 text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label={`Remove ${file.name}`}>
          <X className="size-4" />
        </button>
      </div>
    </li>
  )
}
