import { describe, expect, it } from 'vitest'
import { acceptFiles } from './fileTypes'

const f = (name: string, size = 10) => ({ name, size, lastModified: 1 }) as File

describe('acceptFiles', () => {
  it('keeps what fits, and says why the rest was left out', () => {
    const picked = Array.from({ length: 7 }, (_, i) => f(`shot-${i}.png`))
    const { files, refused } = acceptFiles([], picked, 5)
    expect(files).toHaveLength(5)
    expect(refused).toEqual(['Add up to 5 files at a time.'])
  })
  it('counts files already chosen, leaves out bad types and duplicates', () => {
    const one = f('a.png')
    const { files, refused } = acceptFiles([one], [one, f('setup.exe'), f('b.pdf')], 2)
    expect(files.map((x) => x.name)).toEqual(['a.png', 'b.pdf'])
    expect(refused).toEqual(["setup.exe: this type of file can't be added."])
  })
  it('with no limit, takes every good file', () => {
    expect(acceptFiles([], [f('a.png'), f('b.png')]).files).toHaveLength(2)
  })
})

describe('empty files', () => {
  it('an empty file is refused, with its name', () => {
    const empty = { name: 'blank.pdf', size: 0, lastModified: 1 }
    expect(acceptFiles([], [empty])).toEqual({ files: [], refused: ['blank.pdf is empty.'] })
  })
})

describe('chat file names and sizes (spec 6.9, slice 6)', () => {
  it('a pasted image is named after when it was pasted, with its type', async () => {
    const { pastedName } = await import('@/lib/fileTypes')
    expect(pastedName('image/png', new Date(2026, 9, 29, 9, 5))).toBe('Pasted image 2026-10-29 at 09.05.png')
    expect(pastedName('image/jpeg', new Date(2026, 9, 29, 14, 42))).toBe('Pasted image 2026-10-29 at 14.42.jpg')
    expect(pastedName('', new Date(2026, 9, 29, 14, 42))).toBe('Pasted image 2026-10-29 at 14.42.png')
  })

  it('a file’s line under its name: its type, then its size', async () => {
    const { fileSubline } = await import('@/lib/fileTypes')
    expect(fileSubline('safari-focus-ring.png', 421_888)).toBe('PNG · 412 KB')
    expect(fileSubline('Scope v3.pdf', 1_258_291)).toBe('PDF · 1.2 MB')
    expect(fileSubline('Makefile', 10)).toBe('File · 1 KB')
  })
})
