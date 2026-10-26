import clsx from 'clsx'
import { FileText, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { openFile, useProjectFiles, useUploadFile } from '@/api/projects'
import type { StoredFile, User } from '@/api/types'
import { Card, CardHeader } from '@/components/ui/Card'
import { FileViewer } from '@/components/ui/FileViewer'
import { acceptedFiles, allowedFilesHint } from '@/lib/fileTypes'
import { timeAgo } from '@/lib/format'

const sizeText = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/** The project's files: a list that opens each in the viewer, and a drop zone for people who can post. */
export function ProjectFiles({ projectId, people, canUpload }: { projectId: string; people: User[]; canUpload: boolean }) {
  const files = useProjectFiles(projectId)
  const upload = useUploadFile()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [viewing, setViewing] = useState<{ name: string; url: string; sizeKb: number } | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  const send = (list: FileList | null) => {
    const file = list?.[0]
    if (file) upload.mutate({ projectId, file })
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

  return (
    <Card>
      <CardHeader title="Files" />
      <div className="space-y-3 p-5">
        {files.isPending ? (
          <div className="h-12 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
        ) : files.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">Files couldn't be loaded.</p>
        ) : files.data.length === 0 ? (
          <p className="text-sm text-fg-muted">No files yet.</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {files.data.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => void show(f)} className="flex w-full items-center gap-3 rounded-md py-2 text-start hover:bg-surface-muted">
                  <FileText className="size-4 shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{f.attachment.name}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {sizeText(f.attachment.size)} · {nameOf(f.uploadedBy)} · {timeAgo(f.createdAt)}
                    </span>
                  </span>
                </button>
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
            <button type="button" onClick={() => inputRef.current?.click()} disabled={upload.isPending} className="inline-flex items-center gap-1.5 font-medium text-accent hover:text-accent-strong disabled:opacity-60">
              <Upload className="size-4" /> {upload.isPending ? 'Uploading…' : 'Add a file'}
            </button>
            <span className="text-fg-muted"> or drop it here</span>
            <p className="mt-1 text-xs text-fg-muted">{allowedFilesHint}</p>
            <input
              ref={inputRef}
              type="file"
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
        {upload.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {(upload.error as Error).message}
          </p>
        )}
      </div>
      {viewing && <FileViewer files={[viewing]} onClose={close} />}
    </Card>
  )
}
