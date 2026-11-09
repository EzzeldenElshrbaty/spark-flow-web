// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, UploadOptions } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { api } from '@/lib/api'
import { uploadProgress } from '@/pages/chat/uploads/uploadProgress'
import { useUploads } from '@/pages/chat/uploads/useUploads'

afterEach(() => vi.restoreAllMocks())

const file = (name: string, size = 10) => new File(['x'.repeat(size)], name, { type: name.endsWith('.png') ? 'image/png' : 'application/pdf', lastModified: name.length })
const uploaded = (name: string) => ({ id: `a-${name}`, name, title: name, scanStatus: 'clean' }) as Attachment

/** Stands in for the server: each upload waits until the test settles it. */
function serve() {
  const calls: { channelId: string; name: string; options: UploadOptions; resolve: (a: Attachment) => void; reject: (e: unknown) => void }[] = []
  vi.spyOn(api.files, 'uploadForChat').mockImplementation(
    (channelId, f, options = {}) => new Promise((resolve, reject) => calls.push({ channelId, name: f.name, options, resolve, reject })),
  )
  return calls
}

describe('useUploads: the composer’s tray (spec 6.9, slice 6)', () => {
  it('uploads each file as it’s added, with progress, until it’s ready; Send waits for it', async () => {
    const calls = serve()
    const { result } = renderHook(() => useUploads('c-backend'))
    act(() => result.current.add([file('scope.pdf'), file('shot.png')]))
    expect(calls.map((c) => [c.channelId, c.name])).toEqual([['c-backend', 'scope.pdf'], ['c-backend', 'shot.png']])
    expect(result.current.items.map((i) => i.status)).toEqual(['uploading', 'uploading'])
    expect(result.current.waiting).toBe('Uploading 2 files…')
    // Progress goes to the card alone (uploadProgress): the page's list of uploads doesn't change on every tick.
    const before = result.current.items
    act(() => calls[0].options.onProgress?.(0.5))
    expect(result.current.items).toBe(before)
    expect(uploadProgress.get(result.current.items[0].key)).toBe(0.5)
    await act(async () => calls[0].resolve(uploaded('scope.pdf')))
    expect(result.current.items[0]).toMatchObject({ status: 'ready', progress: 1 })
    expect(result.current.waiting).toBe('Uploading 1 file…')
    await act(async () => calls[1].resolve(uploaded('shot.png')))
    expect(result.current.waiting).toBeNull()
    expect(result.current.ready.map((f) => f.id)).toEqual(['a-scope.pdf', 'a-shot.png'])
  })

  it('a failed upload says why on its card and can be tried again; Send waits until it’s retried or removed', async () => {
    const calls = serve()
    const { result } = renderHook(() => useUploads('c-backend'))
    act(() => result.current.add([file('scope.pdf')]))
    await act(async () => calls[0].reject(new ApiError({ title: 'Bad Request', status: 400, detail: 'Files can be up to 25 MB.' })))
    expect(result.current.items[0]).toMatchObject({ status: 'failed', error: 'Files can be up to 25 MB.' })
    expect(result.current.waiting).toBe("Retry or remove the files that didn’t upload.")
    act(() => result.current.retry(result.current.items[0].key))
    expect(calls).toHaveLength(2)
    expect(result.current.items[0].status).toBe('uploading')
  })

  it('refuses a type it can’t take and anything past 10, saying why; removing one cancels its upload', () => {
    const calls = serve()
    const { result } = renderHook(() => useUploads('c-backend'))
    act(() => result.current.add([file('run.exe')]))
    expect(result.current.refused).toEqual(["run.exe: this type of file can’t be added."])
    act(() => result.current.add(Array.from({ length: 11 }, (_, i) => file(`f${i}.pdf`))))
    expect(result.current.items).toHaveLength(10)
    expect(result.current.refused).toEqual(['Add up to 10 files at a time.'])
    const first = result.current.items[0]
    act(() => result.current.remove(first.key))
    expect(calls[0].options.signal?.aborted).toBe(true)
    expect(result.current.items).toHaveLength(9)
  })

  it('a sent message empties the tray; another channel starts with an empty one and cancels what was going up', () => {
    const calls = serve()
    const { result, rerender } = renderHook(({ channelId }) => useUploads(channelId), { initialProps: { channelId: 'c-backend' } })
    act(() => result.current.add([file('scope.pdf')]))
    rerender({ channelId: 'c-general' })
    expect(calls[0].options.signal?.aborted).toBe(true)
    expect(result.current.items).toEqual([])
    act(() => result.current.add([file('scope.pdf')]))
    act(() => result.current.clear())
    expect(result.current.items).toEqual([])
  })
})

describe('useUploads after the slice 6 review', () => {
  it('a file the scan blocked is not ready: its card says so, with no Retry, and Send waits until it’s removed', async () => {
    const calls = serve()
    const { result } = renderHook(() => useUploads('c-backend'))
    act(() => result.current.add([file('scope.pdf'), file('virus.pdf')]))
    await act(async () => calls[0].resolve({ ...uploaded('scope.pdf'), scanStatus: 'clean' }))
    await act(async () => calls[1].resolve({ ...uploaded('virus.pdf'), scanStatus: 'blocked' }))
    expect(result.current.items[1]).toMatchObject({ status: 'failed', error: 'This file was blocked.', retryable: false })
    expect(result.current.ready.map((f) => f.id)).toEqual(['a-scope.pdf'])
    expect(result.current.waiting).toBe('Remove the files that were blocked.')
    act(() => result.current.remove(result.current.items[1].key))
    expect(result.current.waiting).toBeNull()
  })

  it('a file still being checked isn’t ready either: it can be tried again', async () => {
    const calls = serve()
    const { result } = renderHook(() => useUploads('c-backend'))
    act(() => result.current.add([file('scope.pdf')]))
    await act(async () => calls[0].resolve({ ...uploaded('scope.pdf'), scanStatus: 'pending' }))
    expect(result.current.items[0]).toMatchObject({ status: 'failed', error: 'Still being checked for viruses. Try again in a moment.', retryable: true })
    expect(result.current.waiting).toBe("Retry or remove the files that didn’t upload.")
  })
})

describe('useUploads: clearing what was sent (slice 6 review)', () => {
  it('clear(keys) takes only those cards away: files added while a reply was sending stay', async () => {
    const calls = serve()
    const { result } = renderHook(() => useUploads('c-backend'))
    act(() => result.current.add([file('scope.pdf')]))
    await act(async () => calls[0].resolve(uploaded('scope.pdf')))
    const sent = result.current.items.map((i) => i.key)
    act(() => result.current.add([file('late.png')]))
    act(() => result.current.clear(sent))
    expect(result.current.items.map((i) => i.file.name)).toEqual(['late.png'])
  })
})

describe('useUploads: files added from Flow (spec 6.8 Add from Flow files)', () => {
  it('join the tray ready, once each, and go with the message', () => {
    const { result } = renderHook(() => useUploads('c-backend'))
    const picked = { ...uploaded('scope.pdf'), size: 188_416, mimeType: 'application/pdf' } as Attachment
    act(() => result.current.addExisting([picked, picked]))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]).toMatchObject({ status: 'ready', uploaded: picked, existing: true })
    expect(result.current.ready).toEqual([picked])
    expect(result.current.waiting).toBeNull()
  })

  it('no more than 10 files in the tray, and says so', () => {
    const { result } = renderHook(() => useUploads('c-backend'))
    act(() => result.current.addExisting(Array.from({ length: 12 }, (_, i) => ({ ...uploaded(`f${i}.pdf`), size: 1, mimeType: 'application/pdf' }) as Attachment)))
    expect(result.current.items).toHaveLength(10)
    expect(result.current.refused).toEqual(['Add up to 10 files at a time.'])
  })
})
