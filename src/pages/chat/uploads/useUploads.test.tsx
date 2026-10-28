// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, UploadOptions } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { api } from '@/lib/api'
import { useUploads } from '@/pages/chat/uploads/useUploads'

afterEach(() => vi.restoreAllMocks())

const file = (name: string, size = 10) => new File(['x'.repeat(size)], name, { type: name.endsWith('.png') ? 'image/png' : 'application/pdf', lastModified: name.length })
const uploaded = (name: string) => ({ id: `a-${name}`, name, title: name }) as Attachment

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
    act(() => calls[0].options.onProgress?.(0.5))
    expect(result.current.items[0].progress).toBe(0.5)
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
    expect(result.current.waiting).toBe("Retry or remove the files that didn't upload.")
    act(() => result.current.retry(result.current.items[0].key))
    expect(calls).toHaveLength(2)
    expect(result.current.items[0].status).toBe('uploading')
  })

  it('refuses a type it can’t take and anything past 10, saying why; removing one cancels its upload', () => {
    const calls = serve()
    const { result } = renderHook(() => useUploads('c-backend'))
    act(() => result.current.add([file('run.exe')]))
    expect(result.current.refused).toEqual(["run.exe: this type of file can't be added."])
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
