import { FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo, type LucideIcon } from 'lucide-react'
import type { Attachment, ProjectFileFilter, ProjectFileSource } from '@/api/types'
import { fileKind, type FileKind } from '@/lib/fileTypes'

const ICONS: Record<FileKind, LucideIcon> = { image: FileImage, pdf: FileText, document: FileText, snippet: FileCode, audio: FileAudio, video: FileVideo, other: FileArchive }

/** A file's type icon (lucide), by its kind: a picture, a page, code, a sound, a film, anything else. */
export const fileIcon = (file: Pick<Attachment, 'name' | 'mimeType'> & { snippet?: unknown }): LucideIcon => ICONS[fileKind(file)]

/** The Files tab's From chips (`?from=`). */
export const FROM_CHIPS: readonly [ProjectFileSource['kind'] | 'all', string][] = [
  ['all', 'All'],
  ['task', 'Tasks'],
  ['comment', 'Comments'],
  ['chat', 'Chat'],
  ['overview', 'Overview'],
]

/** The Files tab's Type select (`?type=`). */
export const TYPE_OPTIONS: readonly [FileKind | '', string][] = [
  ['', 'Any type'],
  ['image', 'Images'],
  ['pdf', 'PDFs'],
  ['document', 'Documents'],
  ['snippet', 'Snippets'],
  ['video', 'Videos'],
  ['other', 'Other'],
]

/** The list's filter from the address; a value it doesn't know is left out. */
export function filterOf(params: URLSearchParams): Omit<ProjectFileFilter, 'cursor'> {
  const from = FROM_CHIPS.find(([value]) => value !== 'all' && value === params.get('from'))?.[0] as ProjectFileSource['kind'] | undefined
  const type = TYPE_OPTIONS.find(([value]) => value !== '' && value === params.get('type'))?.[0] as FileKind | undefined
  return { ...(from && { from }), ...(type && { type }) }
}

/** Where a file came from, as its From link reads: "NEX-108 · Attachment", "NEX-105 · Bug", "Chat", "Overview". */
export function sourceLabel(source: ProjectFileSource): string {
  switch (source.kind) {
    case 'task':
      return `${source.taskKey} · Attachment`
    case 'comment':
      return `${source.taskKey} · ${source.bug ? 'Bug' : 'Comment'}`
    case 'chat':
      return 'Chat'
    case 'overview':
      return 'Overview'
  }
}

/** A file's type as its extension in capitals ("PDF"), or "—" without one. */
export function typeLabel(file: Pick<Attachment, 'name'>): string {
  const dot = file.name.lastIndexOf('.')
  return dot > 0 && dot < file.name.length - 1 ? file.name.slice(dot + 1).toUpperCase() : '—'
}
