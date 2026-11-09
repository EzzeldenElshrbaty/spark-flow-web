import { describe, expect, it } from 'vitest'
import { queueRows, rowLabel, type UploadRow } from './uploadQueue'

const f = (name: string) => new File(['x'], name)

describe('upload queue', () => {
  it('three files queue in order; a refused one starts failed with its reason', () => {
    const rows = queueRows([f('a.pdf'), f('b.exe'), f('c.png')], (file) => (file.name.endsWith('.exe') ? "b.exe: this type of file can’t be added." : null))
    expect(rows.map((r) => [r.name, r.state, r.error])).toEqual([
      ['a.pdf', 'queued', null],
      ['b.exe', 'failed', "b.exe: this type of file can’t be added."],
      ['c.png', 'queued', null],
    ])
    expect(new Set(rows.map((r) => r.id)).size).toBe(3)
  })
  it('labels', () => {
    const row = (state: UploadRow['state'], error: string | null = null): UploadRow => ({ id: '1', name: 'a.pdf', state, error })
    expect(rowLabel(row('queued'))).toBe('Waiting…')
    expect(rowLabel(row('uploading'))).toBe('Uploading…')
    expect(rowLabel({ ...row('uploading'), progress: 0.5 })).toBe('Uploading… 50%')
    expect(rowLabel(row('done'))).toBe('Uploaded')
    expect(rowLabel(row('cancelled'))).toBe('Cancelled')
    expect(rowLabel(row('failed', 'Files can be up to 25 MB.'))).toBe('Files can be up to 25 MB.')
  })
})
