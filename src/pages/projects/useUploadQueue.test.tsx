// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acceptFiles } from '@/lib/fileTypes'
import { rowLabel } from './uploadQueue'
import { useUploadQueue, type QueueUpload } from './useUploadQueue'

afterEach(cleanup)

const f = (name: string, type = 'application/pdf') => new File(['x'], name, { type })
type Call = { file: File; signal: AbortSignal; onProgress: (p: number) => void; resolve: (v: string) => void; reject: (e: unknown) => void }

/** An upload that waits until the test settles it. */
function fakeUpload() {
  const calls: Call[] = []
  const upload: QueueUpload<string> = (file, { signal, onProgress }) =>
    new Promise((resolve, reject) => {
      calls.push({ file, signal, onProgress, resolve, reject })
    })
  return { calls, upload: vi.fn(upload) }
}

describe('useUploadQueue', () => {
  it('uploads one at a time, in order; a finished row is reported with its tag and leaves the list', async () => {
    const { calls, upload } = fakeUpload()
    const onDone = vi.fn()
    const { result } = renderHook(() => useUploadQueue(upload, onDone))
    act(() => result.current.add([f('a.pdf'), f('b.pdf')], 'editor'))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(result.current.rows.map((r) => r.state)).toEqual(['uploading', 'queued'])
    expect(result.current.busy).toBe(true)
    await act(async () => calls[0]!.resolve('A'))
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(onDone).toHaveBeenCalledWith('A', expect.objectContaining({ name: 'a.pdf', tag: 'editor' }))
    expect(result.current.rows.map((r) => r.name)).toEqual(['b.pdf'])
    await act(async () => calls[1]!.resolve('B'))
    await waitFor(() => expect(result.current.rows).toEqual([]))
    expect(result.current.busy).toBe(false)
  })

  it('a refused file starts failed with its sentence and never uploads', () => {
    const { upload } = fakeUpload()
    const { result } = renderHook(() => useUploadQueue(upload, vi.fn()))
    const exe = f('setup.exe', 'application/x-msdownload')
    act(() => result.current.add([exe]))
    expect(result.current.rows[0]).toMatchObject({ state: 'failed', error: acceptFiles([], [exe]).refused[0] })
    expect(upload).not.toHaveBeenCalled()
    expect(result.current.busy).toBe(false)
  })

  it('cancel, then try again uploads it; a refused upload fails with its message; progress shows', async () => {
    const { calls, upload } = fakeUpload()
    const { result } = renderHook(() => useUploadQueue(upload, vi.fn()))
    act(() => result.current.add([f('a.pdf')]))
    await waitFor(() => expect(calls).toHaveLength(1))
    act(() => calls[0]!.onProgress(0.5))
    expect(rowLabel(result.current.rows[0]!)).toBe('Uploading… 50%')
    const id = result.current.rows[0]!.id
    act(() => result.current.cancel(id))
    expect(calls[0]!.signal.aborted).toBe(true)
    await act(async () => calls[0]!.reject(new DOMException('Cancelled', 'AbortError')))
    expect(result.current.rows[0]!.state).toBe('cancelled')
    expect(result.current.canRetry(id)).toBe(true)
    act(() => result.current.retry(id))
    await waitFor(() => expect(calls).toHaveLength(2))
    await act(async () => calls[1]!.reject(new Error('Files can be up to 25 MB.')))
    expect(result.current.rows[0]).toMatchObject({ state: 'failed', error: 'Files can be up to 25 MB.' })
    act(() => result.current.dismiss(id))
    expect(result.current.rows).toEqual([])
  })
})

describe('useUploadQueue when its screen closes', () => {
  it('with cancelOnUnmount, the file going up stops and the rest never start', async () => {
    const { calls, upload } = fakeUpload()
    const { result, unmount } = renderHook(() => useUploadQueue(upload, vi.fn(), { cancelOnUnmount: true }))
    act(() => result.current.add([f('a.pdf'), f('b.pdf')]))
    await waitFor(() => expect(calls).toHaveLength(1))
    unmount()
    expect(calls[0]!.signal.aborted).toBe(true)
    await act(async () => calls[0]!.reject(new DOMException('Cancelled', 'AbortError')))
    expect(calls).toHaveLength(1)
  })
})

describe('useUploadQueue with a limit', () => {
  const sentence = 'Attach up to 20 files to a task.'

  it('past its room a file starts failed with the limit’s sentence and never uploads; a refused type takes no room', async () => {
    const { calls, upload } = fakeUpload()
    const { result } = renderHook(() => useUploadQueue(upload, vi.fn(), { limit: { room: 2, sentence } }))
    const exe = f('setup.exe', 'application/x-msdownload')
    act(() => result.current.add([f('a.pdf'), exe, f('b.pdf'), f('c.pdf')]))
    expect(result.current.rows.map((r) => [r.name, r.error])).toEqual([['a.pdf', null], ['setup.exe', acceptFiles([], [exe]).refused[0]], ['b.pdf', null], ['c.pdf', sentence]])
    // Rows still waiting or going count against the room.
    act(() => result.current.add([f('d.pdf')]))
    expect(result.current.rows.at(-1)).toMatchObject({ name: 'd.pdf', state: 'failed', error: sentence })
    expect(result.current.canRetry(result.current.rows.at(-1)!.id)).toBe(false)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.file.name).toBe('a.pdf')
  })

  it('Try again waits for room', async () => {
    const { calls, upload } = fakeUpload()
    const { result } = renderHook(() => useUploadQueue(upload, vi.fn(), { limit: { room: 1, sentence } }))
    act(() => result.current.add([f('a.pdf')]))
    await waitFor(() => expect(calls).toHaveLength(1))
    const a = result.current.rows[0]!.id
    act(() => result.current.cancel(a))
    act(() => result.current.add([f('b.pdf')]))
    act(() => result.current.retry(a))
    expect(result.current.rows.find((r) => r.id === a)).toMatchObject({ state: 'failed', error: sentence })
    expect(result.current.canRetry(a)).toBe(true)
  })

  it('room the owner gets back (a file taken off) takes new files again', () => {
    const { upload } = fakeUpload()
    const { result, rerender } = renderHook(({ room }) => useUploadQueue(upload, vi.fn(), { limit: { room, sentence } }), { initialProps: { room: 0 } })
    act(() => result.current.add([f('a.pdf')]))
    expect(result.current.rows[0]).toMatchObject({ state: 'failed', error: sentence })
    rerender({ room: 1 })
    act(() => result.current.add([f('b.pdf')]))
    expect(result.current.rows[1]!.error).toBeNull()
  })
})
