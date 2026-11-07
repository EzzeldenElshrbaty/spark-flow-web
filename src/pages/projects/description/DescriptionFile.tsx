import clsx from 'clsx'
import { useFileUrl } from '@/components/AttachmentView'
import { fileKind, sizeText } from '@/lib/fileTypes'
import { fileIcon } from '../fileSources'
import type { DescFile } from './FileNode'

/**
 * One of the task's files inside its description, in the editor and in the panel: a picture for an image, otherwise a
 * chip (type icon, title, size). With `onOpen` it's a button that opens the file in the viewer.
 */
export function DescriptionFile({ file, onOpen }: { file: DescFile; onOpen?: () => void }) {
  if (fileKind(file) === 'image') return <Picture file={file} onOpen={onOpen} />
  return <Chip file={file} onOpen={onOpen} />
}

function Chip({ file, onOpen }: { file: DescFile; onOpen?: () => void }) {
  const Icon = fileIcon(file)
  const inner = (
    <>
      <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
      <span className="min-w-0 truncate text-sm text-fg">{file.title}</span>
      <span className="shrink-0 text-xs text-fg-muted tabular-nums">{sizeText(file.size)}</span>
    </>
  )
  const cls = 'inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-start'
  return onOpen ? (
    <button type="button" onClick={onOpen} aria-label={file.title} className={clsx(cls, 'hover:bg-surface-muted')}>
      {inner}
    </button>
  ) : (
    <span className={cls}>{inner}</span>
  )
}

function Picture({ file, onOpen }: { file: DescFile; onOpen?: () => void }) {
  const { url, failed } = useFileUrl(file.id)
  // A picture that can't be shown (blocked, still being checked) is a chip instead.
  if (failed) return <Chip file={file} onOpen={onOpen} />
  const picture = url ? (
    <img src={url} alt={file.title} className="max-h-64 max-w-full rounded-lg border border-line object-contain" />
  ) : (
    <span className="block h-32 w-48 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
  )
  return onOpen ? (
    <button type="button" onClick={onOpen} aria-label={file.title} className="block max-w-full">
      {picture}
    </button>
  ) : (
    picture
  )
}
