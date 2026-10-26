import clsx from 'clsx'
import { ChevronDown, FileArchive, FileImage, FileSpreadsheet, FileText, Presentation, type LucideIcon } from 'lucide-react'
import { useContext, useState, type ReactNode } from 'react'
import { previewOf } from '../../lib/fileTypes'
import { formatWhen } from '../../lib/format'
import { OpenUploadContext } from '../../lib/uploadAccordion'
import { FileViewer } from './FileViewer'

export type GroupFile = { id: string; name: string; url?: string; sizeKb?: number; kind?: 'file' | 'link'; title?: string; category?: string; addedBy: string; addedAt: string }

const sizeText = (sizeKb = 0) => (sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`)

const extensionOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toUpperCase() : 'FILE')

/** An icon and a soft colour for each kind of file, so a ZIP or an Excel sheet is told apart at a glance. */
function typeLook(name: string): { icon: LucideIcon; tone: string } {
  const type = extensionOf(name)
  if (['ZIP', 'RAR'].includes(type)) return { icon: FileArchive, tone: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' }
  if (['XLS', 'XLSX', 'CSV'].includes(type)) return { icon: FileSpreadsheet, tone: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300' }
  if (['PPT', 'PPTX'].includes(type)) return { icon: Presentation, tone: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300' }
  if (['DOC', 'DOCX', 'TXT'].includes(type)) return { icon: FileText, tone: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' }
  if (type === 'PDF') return { icon: FileText, tone: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' }
  return { icon: FileImage, tone: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300' }
}

/** Rows of the collage: two wide photos on top, then three, as in a photo post. */
function collageRows<T>(images: T[]): T[][] {
  if (images.length <= 2) return [images]
  if (images.length === 3) return [images.slice(0, 1), images.slice(1)]
  if (images.length === 4) return [images.slice(0, 2), images.slice(2)]
  return [images.slice(0, 2), images.slice(2, 5)]
}

/** A file list whose uploads open one at a time: opening one closes the others. */
export function UploadList({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <OpenUploadContext.Provider value={{ openId, setOpenId }}>
      <ul className="divide-y divide-line-subtle">{children}</ul>
    </OpenUploadContext.Provider>
  )
}

/**
 * One upload (files picked together, or a single file) as a collapsible entry. The heading is the upload's title;
 * without one, a single file's name, or when several were uploaded. Open, its photos show as a collage, other files as tiles with their type,
 * and the usual rows (download, note, remove) below. Any photo or tile opens the viewer on that file.
 */
export function UploadGroup({ files, children }: { files: GroupFile[]; children: ReactNode }) {
  const list = useContext(OpenUploadContext)
  const [openHere, setOpenHere] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const first = files[0]
  // Inside an UploadList only one entry is open; on its own an entry opens and closes by itself.
  const open = list ? list.openId === first.id : openHere
  const setOpen = (value: boolean) => (list ? list.setOpenId(value ? first.id : null) : setOpenHere(value))

  const viewable = files.filter((file) => file.kind !== 'link' && file.url)
  const images = viewable.filter((file) => previewOf(file.name) === 'image')
  const others = viewable.filter((file) => previewOf(file.name) !== 'image')
  const rows = collageRows(images)
  const shown = rows.flat().length
  const view = (file: GroupFile) => setViewing(viewable.indexOf(file))
  const total = files.reduce((sum, file) => sum + (file.sizeKb ?? 0), 0)

  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-sunken">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{first.title || (files.length === 1 ? first.name : `Upload · ${formatWhen(first.addedAt)}`)}</p>
          <p className="truncate text-xs text-fg-muted">
            {files.length === 1 ? formatWhen(first.addedAt) : `${files.length} files`}
            {total > 0 && ` · ${sizeText(total)}`}
            {first.category && ` · ${first.category}`} · {first.addedBy}
          </p>
        </div>
        {!open && images.length > 0 && (
          <span className="flex shrink-0 -space-x-2">
            {images.slice(0, 3).map((file) => (
              <img key={file.id} src={file.url} alt="" className="size-8 rounded-md object-cover ring-2 ring-surface" />
            ))}
          </span>
        )}
        <ChevronDown className={clsx('size-4 shrink-0 text-fg-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 px-5 pb-4">
          {rows.length > 0 && rows[0].length > 0 && (
            <div className="space-y-1 overflow-hidden rounded-lg">
              {rows.map((row, rowIndex) => (
                <div key={rowIndex} className={clsx('grid gap-1', row.length === 1 ? 'grid-cols-1' : row.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                  {row.map((file) => {
                    const more = file === rows.flat()[shown - 1] ? images.length - shown : 0
                    return (
                      <button key={file.id} type="button" onClick={() => view(file)} className={clsx('relative block overflow-hidden bg-surface-muted', rowIndex === 0 && row.length < 3 ? 'h-40 sm:h-48' : 'h-28 sm:h-32')} aria-label={`View ${file.name}`}>
                        <img src={file.url} alt={file.name} loading="lazy" className="size-full object-cover transition-transform hover:scale-105" />
                        {more > 0 && <span className="absolute inset-0 flex items-center justify-center bg-black/75 text-2xl font-semibold text-white">+{more}</span>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
          {others.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {others.map((file) => {
                const { icon: Icon, tone } = typeLook(file.name)
                return (
                  <button key={file.id} type="button" onClick={() => view(file)} className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg border border-line p-3 text-center hover:bg-surface-sunken" aria-label={`View ${file.name}`}>
                    <span className={clsx('flex size-11 items-center justify-center rounded-lg', tone)}>
                      <Icon className="size-6" />
                    </span>
                    <span className={clsx('rounded px-1.5 text-[10px] font-semibold', tone)}>{extensionOf(file.name)}</span>
                    <span className="w-full truncate text-xs text-fg">{file.name}</span>
                    {file.sizeKb !== undefined && <span className="text-[11px] text-fg-muted">{sizeText(file.sizeKb)}</span>}
                  </button>
                )
              })}
            </div>
          )}
          <ul className="divide-y divide-line-subtle rounded-lg border border-line-subtle [&>li]:px-3">{children}</ul>
        </div>
      )}
      {viewing !== null && viewing >= 0 && (
        <FileViewer files={viewable.map((file) => ({ name: file.name, url: file.url!, sizeKb: file.sizeKb }))} start={viewing} onClose={() => setViewing(null)} />
      )}
    </li>
  )
}
