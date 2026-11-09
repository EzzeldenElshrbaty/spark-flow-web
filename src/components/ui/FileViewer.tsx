import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Download, FileText, Minus, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { downloadUrl, previewOf } from '@/lib/fileTypes'
import { fetchCredentials, type ViewedFile } from '@/lib/fileView'
import { isPdf } from '@/lib/pdfSignature'
import { safeFileUrl } from '@/lib/safeFileUrl'

// ViewedFile (lib/fileView): `preview` is how to show it when its name doesn't say (an office file's converted PDF
// preview); `download` is what Download saves when that isn't what's shown (the file itself); null hides Download.

/** What Download saves for a shown file, through safeFileUrl, or null. */
function savedAs(file: ViewedFile): { url: string; name: string } | null {
  const target = file.download === undefined ? (file.url ? { url: file.url, name: file.name } : null) : file.download
  const url = target && safeFileUrl(target.url)
  return url ? { url, name: target.name } : null
}

const sizeText = (sizeKb?: number) => (sizeKb === undefined ? '' : sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`)

/**
 * Full-screen preview of a file inside the CRM: images, PDFs, text and CSV. Other types show a card to download.
 * With several files (one upload), arrows and the keyboard's left and right keys step through them.
 */
export function FileViewer({
  files,
  start = 0,
  onClose,
  onDownload,
}: {
  files: ViewedFile[]
  start?: number
  onClose: () => void
  /** Download was chosen for the file at this index (the audit log notes it, slice 2). */
  onDownload?: (index: number) => void
}) {
  const [index, setIndex] = useState(start)
  const shown = files[index]
  // Only same-origin, https and blob: addresses are opened at all; anything else gets no preview and no link.
  const url = safeFileUrl(shown.url)
  const file = { ...shown, url: url ?? '' }
  const preview = url ? (shown.preview ?? previewOf(file.name)) : 'none'
  const many = files.length > 1
  const step = (by: number) => setIndex((current) => (current + by + files.length) % files.length)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (files.length > 1 && event.key === 'ArrowRight') setIndex((current) => (current + 1) % files.length)
      if (files.length > 1 && event.key === 'ArrowLeft') setIndex((current) => (current - 1 + files.length) % files.length)
    }
    document.addEventListener('keydown', onKeyDown)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [onClose, files.length])

  return createPortal(
    // Any Download inside (the bar's, or a preview's own when it can't show the file) is one download of this file.
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/85"
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      onClick={(event) => {
        if (onDownload && (event.target as Element).closest('a[download]')) onDownload(index)
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-white sm:px-4">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</p>
        {many && (
          <span className="shrink-0 text-xs tabular-nums text-white/70">
            {index + 1} of {files.length}
          </span>
        )}
        {savedAs(file) && (
          <a
            href={downloadUrl(savedAs(file)!.url)}
            download={savedAs(file)!.name}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/30 hover:bg-white/10"
          >
            <Download className="size-4" /> Download
          </a>
        )}
        <button type="button" onClick={onClose} className="rounded-full p-2 text-white hover:bg-white/10" aria-label="Close" title="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-stretch justify-center px-2 pb-2 sm:px-14 sm:pb-4">
        {many && (
          <>
            <button type="button" onClick={() => step(-1)} className="absolute start-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 sm:start-3" aria-label="Previous file" title="Previous file">
              <ChevronLeft className="size-6 rtl:-scale-x-100" />
            </button>
            <button type="button" onClick={() => step(1)} className="absolute end-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 sm:end-3" aria-label="Next file" title="Next file">
              <ChevronRight className="size-6 rtl:-scale-x-100" />
            </button>
          </>
        )}
        {preview === 'image' && <ImageView key={file.url} file={file} />}
        {preview === 'pdf' && <PdfView key={file.url} file={file} />}
        {(preview === 'text' || preview === 'csv') && <TextView key={file.url} file={file} csv={preview === 'csv'} />}
        {preview === 'none' && <NoPreview file={file} message={url ? undefined : "This file can't be opened from here."} />}
      </div>
    </div>,
    document.body,
  )
}

function ImageView({ file }: { file: ViewedFile }) {
  const [zoom, setZoom] = useState(1)
  const fitted = zoom === 1
  return (
    <div className="relative flex min-h-0 w-full flex-1">
      <div className={clsx('flex min-h-0 flex-1 overflow-auto', fitted && 'items-center justify-center')}>
        <img
          src={file.url}
          alt={file.name}
          onClick={() => setZoom(fitted ? 2 : 1)}
          className={clsx('select-none', fitted ? 'max-h-full max-w-full cursor-zoom-in object-contain' : 'm-auto max-w-none cursor-zoom-out')}
          style={fitted ? undefined : { width: `${zoom * 100}%` }}
        />
      </div>
      <div className="absolute bottom-3 start-1/2 flex -translate-x-1/2 rtl:translate-x-1/2 items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-white">
        <button type="button" className="rounded-full p-1.5 hover:bg-white/10 disabled:opacity-40" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 0.5))} aria-label="Zoom out" title="Zoom out">
          <Minus className="size-4" />
        </button>
        <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" className="rounded-full p-1.5 hover:bg-white/10 disabled:opacity-40" disabled={zoom >= 4} onClick={() => setZoom((value) => Math.min(4, value + 0.5))} aria-label="Zoom in" title="Zoom in">
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

/**
 * A PDF is shown only once its bytes start with %PDF-, from a blob: address typed application/pdf, so a renamed HTML
 * page can never run as a page here. Chrome won't show PDFs in a sandboxed frame, which is why the check comes first.
 */
function PdfView({ file }: { file: ViewedFile }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    let made: string | null = null
    fetch(file.url, { credentials: fetchCredentials(file.url) })
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
      .then((buffer) => {
        if (!current) return
        if (!isPdf(new Uint8Array(buffer))) return setFailed(true)
        made = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
        setBlobUrl(made)
      })
      .catch(() => current && setFailed(true))
    return () => {
      current = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [file.url])

  if (failed) return <NoPreview file={file} message="This file can't be previewed. Download it instead." />
  if (!blobUrl) return <p className="self-center text-sm text-white/80">Opening…</p>
  return <iframe src={blobUrl} title={file.name} className="size-full rounded-md bg-white" />
}

/** Splits CSV text into rows, with quoted cells ("a, b" and "" for a quote). Excel in some languages separates with ";". */
function parseCsv(text: string) {
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  const separator = firstLine.split(';').length > firstLine.split(',').length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"'
        index++
      } else if (character === '"') quoted = false
      else cell += character
    } else if (character === '"') quoted = true
    else if (character === separator) {
      row.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += character
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows
}

function TextView({ file, csv }: { file: ViewedFile; csv: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    fetch(file.url, { credentials: fetchCredentials(file.url) })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((body) => current && setText(body))
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [file.url])

  if (failed) return <NoPreview file={file} message="This file couldn't be opened here. Download it instead." />
  if (text === null) return <p className="self-center text-sm text-white/80">Opening…</p>
  const rows = csv ? parseCsv(text).slice(0, 2000) : []
  return (
    <div className="min-h-0 w-full max-w-5xl overflow-auto rounded-md bg-surface text-fg">
      {csv ? (
        <table className="min-w-full border-collapse text-sm">
          <tbody>
            {rows.map((cells, rowIndex) => (
              <tr key={rowIndex} className={clsx(rowIndex === 0 && 'bg-surface-muted font-medium')}>
                {cells.map((value, cellIndex) => (
                  <td key={cellIndex} className="whitespace-nowrap border border-line-subtle px-2 py-1">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <pre className="whitespace-pre-wrap break-words p-4 font-mono text-sm">{text}</pre>
      )}
    </div>
  )
}

function NoPreview({ file, message = "This type of file can't be previewed. Download it to open it." }: { file: ViewedFile; message?: string }) {
  return (
    <div className="m-auto flex w-full max-w-sm flex-col items-center gap-3 rounded-lg bg-surface p-6 text-center">
      <FileText className="size-10 text-fg-muted" />
      <div className="min-w-0 max-w-full">
        <p className="truncate text-sm font-medium text-fg">{file.name}</p>
        {file.sizeKb !== undefined && <p className="text-xs text-fg-muted">{sizeText(file.sizeKb)}</p>}
      </div>
      <p className="text-sm text-fg-secondary">{message}</p>
      {savedAs(file) && (
        <a
          href={downloadUrl(savedAs(file)!.url)}
          download={savedAs(file)!.name}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          <Download className="size-4" /> Download
        </a>
      )}
    </div>
  )
}
