import { useEffect, useRef, useState } from 'react'
import { acceptFiles } from '@/lib/fileTypes'
import { queueRows, type UploadRow } from './uploadQueue'

/** Sends one file; the signal cancels it, and progress is reported from 0 to 1 when the transport knows it. */
export type QueueUpload<T> = (file: File, opts: { signal: AbortSignal; onProgress: (p: number) => void }) => Promise<T>

/** Why a file can't be added (the same rules as the server), or null. */
const refusal = (file: File) => acceptFiles([], [file]).refused[0] ?? null

/**
 * Files going up one at a time, each with its own row: Cancel while it waits or goes, Try again or dismiss when it
 * failed or was cancelled. A finished row calls `onDone` with what the upload returned and leaves the list. `busy`
 * while any row is waiting or going.
 */
export function useUploadQueue<T>(upload: QueueUpload<T>, onDone: (result: T, row: UploadRow) => void) {
  const [rows, setRows] = useState<UploadRow[]>([])
  // A row's file, its Cancel and tag, kept for Try again; the ids waiting their turn; whether one is on its way.
  const jobs = useRef(new Map<string, { file: File; controller: AbortController; tag?: string }>())
  const queue = useRef<string[]>([])
  const running = useRef(false)
  // The latest callbacks: a queue started on one render finishes on a later one.
  const latest = useRef({ upload, onDone })
  useEffect(() => {
    latest.current = { upload, onDone }
  })

  const setRow = (id: string, patch: Partial<UploadRow>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const dismiss = (id: string) => {
    jobs.current.delete(id)
    setRows((all) => all.filter((r) => r.id !== id))
  }
  const pump = async () => {
    if (running.current) return
    running.current = true
    for (let id = queue.current.shift(); id; id = queue.current.shift()) {
      const job = jobs.current.get(id)
      if (!job || job.controller.signal.aborted) continue
      setRow(id, { state: 'uploading', error: null, progress: undefined })
      try {
        const result = await latest.current.upload(job.file, { signal: job.controller.signal, onProgress: (progress) => setRow(id, { progress }) })
        dismiss(id)
        latest.current.onDone(result, { id, name: job.file.name, state: 'done', error: null, tag: job.tag })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') setRow(id, { state: 'cancelled' })
        else setRow(id, { state: 'failed', error: (error as Error).message || "Couldn't upload." })
      }
    }
    running.current = false
  }
  const start = (id: string, file: File, tag?: string) => {
    jobs.current.set(id, { file, controller: new AbortController(), tag })
    queue.current.push(id)
  }
  const add = (list: File[] | FileList | null, tag?: string) => {
    const picked = [...(list ?? [])]
    if (picked.length === 0) return
    const added = queueRows(picked, refusal).map((row) => (tag ? { ...row, tag } : row))
    setRows((all) => [...all, ...added])
    added.forEach((row, i) => row.state === 'queued' && start(row.id, picked[i]!, tag))
    void pump()
  }
  const cancel = (id: string) => {
    jobs.current.get(id)?.controller.abort()
    queue.current = queue.current.filter((q) => q !== id)
    setRow(id, { state: 'cancelled' })
  }
  const retry = (id: string) => {
    const job = jobs.current.get(id)
    if (!job) return
    start(id, job.file, job.tag)
    setRow(id, { state: 'queued', error: null })
    void pump()
  }
  const busy = rows.some((r) => r.state === 'queued' || r.state === 'uploading')
  return { rows, busy, add, cancel, retry, dismiss, canRetry: (id: string) => jobs.current.has(id) }
}
