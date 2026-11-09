import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadChatFile } from '@/api/files'
import { uploadProgress } from '@/pages/chat/uploads/uploadProgress'
import type { Attachment } from '@/api/types'
import { MAX_MESSAGE_FILES } from '@/lib/fileDetails'
import { acceptFiles } from '@/lib/fileTypes'
import { errorText } from '@/pages/chat/usePicked'

/** A file in the composer's tray: going up, ready to send, or failed (with why). */
export type Upload = {
  key: string; file: File; status: 'uploading' | 'ready' | 'failed'; progress: number; uploaded: Attachment | null; error: string | null
  /** A failure Retry can help (not a file the scan blocked). */
  retryable: boolean
  /** Added from Flow files (spec 6.8): already uploaded, so no bytes and no progress. */
  existing?: boolean
}

const filesWord = (n: number) => (n === 1 ? '1 file' : `${n} files`)

/**
 * The composer's tray (spec 6.9): each file added (picked, dropped or pasted) starts uploading at once for this
 * channel; Send waits until all are ready. What can't be added is said; another channel starts with an empty tray and
 * cancels what was still going up. Files that were never sent aren't kept: the server drops them.
 */
/** Keys unique across every tray, as the progress store is shared. */
let uploadKeys = 0

export function useUploads(channelId: string) {
  const [items, setItems] = useState<Upload[]>([])
  const [refused, setRefused] = useState<string[]>([])
  const controllers = useRef(new Map<string, AbortController>())

  const patch = (key: string, change: Partial<Upload>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)))

  const start = useCallback(
    (key: string, file: File) => {
      const controller = new AbortController()
      controllers.current.set(key, controller)
      uploadChatFile(channelId, file, { signal: controller.signal, onProgress: (progress) => uploadProgress.set(key, progress) }).then(
        // Only a file the scan passed is ready to send (spec 6.9); a blocked one can only be removed.
        (uploaded) =>
          patch(
            key,
            uploaded.scanStatus === 'clean'
              ? { status: 'ready', progress: 1, uploaded, error: null }
              : uploaded.scanStatus === 'blocked'
                ? { status: 'failed', progress: 1, uploaded: null, error: 'This file was blocked.', retryable: false }
                : { status: 'failed', progress: 1, uploaded: null, error: 'Still being checked for viruses. Try again in a moment.', retryable: true },
          ),
        (failure: unknown) => {
          if (failure instanceof DOMException && failure.name === 'AbortError') return
          patch(key, { status: 'failed', error: errorText(failure), retryable: true })
        },
      )
    },
    [channelId],
  )

  useEffect(() => {
    const going = controllers.current
    return () => {
      for (const controller of going.values()) controller.abort()
      going.clear()
      setItems([])
      setRefused([])
    }
  }, [channelId])

  const add = (picked: File[]) => {
    const { files, refused: why } = acceptFiles(items.map((i) => i.file), picked, MAX_MESSAGE_FILES)
    const fresh = files.filter((f) => !items.some((i) => i.file === f)).map((file) => ({ key: `u${++uploadKeys}`, file }))
    setRefused(why)
    setItems((list) => [...list, ...fresh.map(({ key, file }) => ({ key, file, status: 'uploading' as const, progress: 0, uploaded: null, error: null, retryable: true }))])
    for (const { key, file } of fresh) start(key, file)
  }
  /** Add from Flow files (spec 6.8): files already uploaded join the tray ready, once each, 10 at most with the rest. */
  const addExisting = (picked: Attachment[]) => {
    const fresh = picked.filter((a, i) => picked.findIndex((b) => b.id === a.id) === i && !items.some((item) => item.uploaded?.id === a.id))
    const room = Math.max(0, MAX_MESSAGE_FILES - items.length)
    setRefused(fresh.length > room ? [`Add up to ${MAX_MESSAGE_FILES} files at a time.`] : [])
    setItems((list) => [
      ...list,
      ...fresh.slice(0, room).map((a) => ({
        key: `u${++uploadKeys}`, file: new File([], a.name, { type: a.mimeType }), status: 'ready' as const, progress: 1, uploaded: a, error: null, retryable: false, existing: true,
      })),
    ])
  }
  const remove = (key: string) => {
    controllers.current.get(key)?.abort()
    controllers.current.delete(key)
    setItems((list) => list.filter((i) => i.key !== key))
  }
  const retry = (key: string) => {
    const item = items.find((i) => i.key === key)
    if (!item) return
    patch(key, { status: 'uploading', progress: 0, error: null })
    start(key, item.file)
  }
  /** After a send: the tray empties, or (with `keys`) loses just the cards that went, keeping any added meanwhile. */
  const clear = (keys?: string[]) => {
    if (keys) {
      for (const key of keys) controllers.current.delete(key)
      setItems((list) => list.filter((i) => !keys.includes(i.key)))
      return
    }
    controllers.current.clear()
    setItems([])
    setRefused([])
  }

  const uploading = items.filter((i) => i.status === 'uploading').length
  const failed = items.filter((i) => i.status === 'failed')
  const waiting = uploading
    ? `Uploading ${filesWord(uploading)}…`
    : failed.some((i) => i.retryable)
      ? "Retry or remove the files that didn’t upload."
      : failed.length
        ? 'Remove the files that were blocked.'
        : null
  const ready = items.flatMap((i) => (i.status === 'ready' && i.uploaded ? [i.uploaded] : []))
  return { items, refused, add, addExisting, remove, retry, clear, waiting, ready }
}

export type Uploads = ReturnType<typeof useUploads>

/**
 * Drop anywhere on a pane (the channel's messages, a thread) to add files to its composer (spec 6.9: drag and drop
 * works everywhere); off while the pane can't take them.
 */
export function paneDrop(enabled: boolean, onAdd: (files: File[]) => void) {
  if (!enabled) return {}
  const files = (event: React.DragEvent) => event.dataTransfer?.types.includes('Files') ?? false
  return {
    onDragOver: (event: React.DragEvent) => files(event) && event.preventDefault(),
    onDrop: (event: React.DragEvent) => {
      if (!files(event) || event.defaultPrevented) return
      event.preventDefault()
      onAdd([...event.dataTransfer.files])
    },
  }
}
