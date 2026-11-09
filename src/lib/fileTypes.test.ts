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
    expect(refused).toEqual(["setup.exe: this type of file can’t be added."])
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

describe('more file types (2026-11-08)', () => {
  const added = ['logo.svg', 'shot.bmp', 'scan.tif', 'scan.tiff', 'page.html', 'page.htm', 'data.json', 'feed.xml', 'notes.md', 'letter.rtf', 'rows.tsv', 'spec.odt', 'plan.ods', 'deck.odp', 'brief.pages', 'budget.numbers', 'pitch.key', 'art.eps', 'ui.fig', 'ui.sketch', 'call.mp3', 'call.wav', 'memo.m4a', 'all.7z']

  it.each(added)('%s can be added, and the file picker offers it', async (name) => {
    const { acceptedFiles, isAcceptedFile } = await import('@/lib/fileTypes')
    expect(isAcceptedFile(name)).toBe(true)
    expect(acceptedFiles.split(',')).toContain(name.slice(name.lastIndexOf('.')))
  })

  it('programs and scripts are still refused', async () => {
    const { isAcceptedFile } = await import('@/lib/fileTypes')
    for (const name of ['setup.exe', 'run.sh', 'run.bat', 'app.js', 'Installer.dmg']) expect(isAcceptedFile(name)).toBe(false)
  })

  it('SVG and BMP open as pictures, Markdown, JSON and XML as text; HTML and the rest only download', async () => {
    const { previewOf } = await import('@/lib/fileTypes')
    expect(previewOf('logo.svg')).toBe('image')
    expect(previewOf('shot.bmp')).toBe('image')
    expect(previewOf('notes.md')).toBe('text')
    expect(previewOf('data.json')).toBe('text')
    expect(previewOf('feed.xml')).toBe('text')
    for (const name of ['page.html', 'page.htm', 'scan.tiff', 'call.mp3', 'ui.fig', 'spec.odt']) expect(previewOf(name)).toBe('none')
  })

  it('the Files tab files SVG under images and the new office, web and data files under documents', async () => {
    const { fileKind } = await import('@/lib/fileTypes')
    expect(fileKind({ name: 'logo.svg', mimeType: 'image/svg+xml' })).toBe('image')
    for (const name of ['letter.rtf', 'rows.tsv', 'spec.odt', 'plan.ods', 'deck.odp', 'brief.pages', 'budget.numbers', 'pitch.key', 'notes.md', 'data.json', 'feed.xml', 'page.html'])
      expect(fileKind({ name, mimeType: '' })).toBe('document')
    for (const name of ['call.mp3', 'ui.fig', 'art.eps', 'all.7z']) expect(fileKind({ name, mimeType: '' })).toBe('other')
  })

  it('the hint names PNG, JPG, SVG and HTML', async () => {
    const { allowedFilesHint } = await import('@/lib/fileTypes')
    for (const type of ['PNG', 'JPG', 'SVG', 'HTML']) expect(allowedFilesHint).toContain(type)
  })
})

describe('downloadUrl', () => {
  it('asks the API to send any of its files as a download, so an HTML or SVG file is never opened as a page', async () => {
    const { downloadUrl } = await import('@/lib/fileTypes')
    expect(downloadUrl('https://api.example.com/api/files/f-1')).toBe('https://api.example.com/api/files/f-1?download=1')
    expect(downloadUrl('/api/files/f-1?v=2')).toBe('/api/files/f-1?v=2&download=1')
    expect(downloadUrl('https://api.example.com/api/documents/d-1')).toBe('https://api.example.com/api/documents/d-1?download=1')
  })

  it('leaves blob: addresses alone (the download attribute works on them)', async () => {
    const { downloadUrl } = await import('@/lib/fileTypes')
    expect(downloadUrl('blob:http://localhost/a1')).toBe('blob:http://localhost/a1')
  })
})
