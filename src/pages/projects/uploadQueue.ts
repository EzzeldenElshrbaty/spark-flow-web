/**
 * One file being added: waiting its turn, on its way, added, or not. `progress` (0 to 1) while it goes up, when the
 * upload reports it; `tag` says where it was added from (the task sheet's description or its Attachments).
 */
export type UploadRow = { id: string; name: string; state: 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled'; error: string | null; progress?: number; tag?: string }

let next = 0

/** A row per picked file, in order. A file `accept` refuses starts failed, with its sentence. */
export function queueRows(files: File[], accept: (file: File) => string | null): UploadRow[] {
  return files.map((file) => {
    const refused = accept(file)
    return { id: `up-${++next}`, name: file.name, state: refused ? 'failed' : 'queued', error: refused }
  })
}

/** What a row says next to its name. */
export function rowLabel(row: UploadRow): string {
  switch (row.state) {
    case 'queued':
      return 'Waiting…'
    case 'uploading':
      return row.progress === undefined ? 'Uploading…' : `Uploading… ${Math.round(row.progress * 100)}%`
    case 'done':
      return 'Uploaded'
    case 'cancelled':
      return 'Cancelled'
    case 'failed':
      return row.error ?? "Couldn't upload."
  }
}
