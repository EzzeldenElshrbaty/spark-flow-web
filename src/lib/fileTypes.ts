// The file types people may add (Ahmed, 2026-10-09). The API checks the same list, and each file's content.

/** Shown inside the CRM's viewer. */
const imageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const previewTypes = ['.pdf', ...imageTypes, '.txt', '.csv']
/** Played in the page (task Activity and chat, spec §5); the viewer offers them to download. */
const videoTypes = ['.mp4', '.webm', '.mov']
/** Download only. */
const downloadTypes = ['.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt', '.zip', '.rar', '.ai', '.psd', '.heic']

const extension = (name: string) => {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot).toLowerCase()
}

/** For a file picker's `accept`. */
export const acceptedFiles = [...previewTypes, ...videoTypes, ...downloadTypes].join(',')

export const maxFileMb = 25

export const isAcceptedFile = (name: string) => [...previewTypes, ...videoTypes, ...downloadTypes].includes(extension(name))

export const allowedFilesHint = 'PDF, images, video (MP4, WebM, MOV), Word, Excel, PowerPoint, CSV, text, ZIP/RAR, AI, PSD or HEIC, up to 25 MB'

export type Preview = 'image' | 'pdf' | 'text' | 'csv' | 'none'

export function previewOf(name: string): Preview {
  const type = extension(name)
  if (imageTypes.includes(type)) return 'image'
  if (type === '.pdf') return 'pdf'
  if (type === '.csv') return 'csv'
  if (type === '.txt') return 'text'
  return 'none'
}

/** The address that saves the file. Files on the API need ?download=1: across addresses the browser ignores `download`. */
export const downloadUrl = (url: string) => (url.includes('/api/documents/') ? `${url}${url.includes('?') ? '&' : '?'}download=1` : url)

/**
 * Files picked into a form: bad types, oversize files and repeats are left out, and so is anything past `max`, each
 * with the sentence saying why.
 */
export function acceptFiles<F extends { name: string; size: number; lastModified: number }>(current: F[], picked: F[], max = Infinity): { files: F[]; refused: string[] } {
  const ok = picked.filter((file) => isAcceptedFile(file.name) && file.size <= maxFileMb * 1024 * 1024)
  const refused = picked
    .filter((file) => !ok.includes(file))
    .map((file) => (isAcceptedFile(file.name) ? `${file.name} is over ${maxFileMb} MB.` : `${file.name}: this type of file can't be added.`))
  // Picking the same file twice adds it once.
  const id = (file: F) => `${file.name}|${file.size}|${file.lastModified}`
  const known = new Set(current.map(id))
  const added = ok.filter((file) => !known.has(id(file)) && (known.add(id(file)), true))
  const all = [...current, ...added]
  if (all.length > max) refused.push(`Add up to ${max} files at a time.`)
  return { files: all.slice(0, max), refused }
}
