import { useEffect, useRef, useState } from 'react'
import { acceptFiles } from '@/lib/fileTypes'
import { queueRows, type UploadRow } from './uploadQueue'

/** Sends one file; the signal cancels it, and progress is reported from 0 to 1 when the transport knows it. */
export type QueueUpload<T> = (file: File, opts: { signal: AbortSignal; onProgress: (p: number) => void }) => Promise<T>

/** Why a file can't be added (the same rules as the server), or null. */
const refusal = (file: File) => acceptFiles([], [file]).refused[0] ?? null

/** At most `room` more files, the queue's own waiting and going rows counted; past it a row fails with `sentence`. */
export type UploadLimit = { room: number; sentence: string }

/**
 * Files going up one at a time, each with its own row: Cancel while it waits or goes, Try again or dismiss when it
 * failed or was cancelled. A finished row calls `onDone` with what the upload returned and leaves the list. `busy`
 * while any row is waiting or going. `cancelOnUnmount`: closing the screen cancels them all. `limit`: a file past it
 * fails as it's added (and Try again waits for room), so nobody learns it at Save.
 */
export function useUploadQueue<T>(
  upload: QueueUpload<T>,
  onDone: (result: T, row: UploadRow) => void,
  { cancelOnUnmount = false, limit }: { cancelOnUnmount?: boolean; limit?: UploadLimit } = {},
) {
  const [rows, setRows] = useState<UploadRow[]>([])
  // The latest finish or failure, for a screen reader: read once, never the percent (UX Phase 5A, 5.12).
  // Each notice is new, even with the same words (a second "notes.pdf uploaded."), so screen readers read it: the
  // status line is keyed by `noticeId` (UX Phase 6).
  const [{ notice, noticeId }, setNoticeState] = useState({ notice: '', noticeId: 0 })
  const setNotice = (text: string) => setNoticeState((last) => ({ notice: text, noticeId: last.noticeId + 1 }))
  // A row's file, its Cancel and tag, kept for Try again; the ids waiting their turn; whether one is on its way.
  const jobs = useRef(new Map<string, { file: File; controller: AbortController; tag?: string }>())
  const queue = useRef<string[]>([])
  const running = useRef(false)
  // The latest callbacks: a queue started on one render finishes on a later one.
  const latest = useRef({ upload, onDone })
  useEffect(() => {
    latest.current = { upload, onDone }
  })
  // A screen whose uploads mean nothing once it's gone (the task sheet) stops them when it closes; Overview's keep going.
  useEffect(() => {
    if (!cancelOnUnmount) return
    const all = jobs.current
    return () => {
      queue.current = []
      for (const job of all.values()) job.controller.abort()
    }
  }, [cancelOnUnmount])

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
        setNotice(`${job.file.name} uploaded.`)
        latest.current.onDone(result, { id, name: job.file.name, state: 'done', error: null, tag: job.tag })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') setRow(id, { state: 'cancelled' })
        else {
          const sentence = (error as Error).message || "Couldn’t upload."
          setRow(id, { state: 'failed', error: sentence })
          setNotice(`${job.file.name}: ${sentence}`)
        }
      }
    }
    running.current = false
  }
  const start = (id: string, file: File, tag?: string) => {
    jobs.current.set(id, { file, controller: new AbortController(), tag })
    queue.current.push(id)
  }
  const pending = rows.filter((r) => r.state === 'queued' || r.state === 'uploading').length
  const room = () => (limit ? limit.room - pending : Infinity)
  const add = (list: File[] | FileList | null, tag?: string) => {
    const picked = [...(list ?? [])]
    if (picked.length === 0) return
    // A refused file takes no room; past the room, the limit's sentence.
    let left = room()
    const accept = (file: File) => refusal(file) ?? (left-- > 0 ? null : limit!.sentence)
    const added = queueRows(picked, accept).map((row) => (tag ? { ...row, tag } : row))
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
    if (room() <= 0) return setRow(id, { state: 'failed', error: limit!.sentence })
    start(id, job.file, job.tag)
    setRow(id, { state: 'queued', error: null })
    void pump()
  }
  const busy = pending > 0
  return { rows, busy, notice, noticeId, add, cancel, retry, dismiss, canRetry: (id: string) => jobs.current.has(id) }
}
