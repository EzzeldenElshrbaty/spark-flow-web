// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv, toCsv } from './csv'

describe('toCsv', () => {
  it('quotes commas, quotes and newlines; BOM; CRLF', () => {
    expect(toCsv([['Project', 'Hours'], ['Nexus, Core', 12.5], ['Say "hi"', 'two\nlines']])).toBe('﻿Project,Hours\r\n"Nexus, Core",12.5\r\n"Say ""hi""","two\nlines"')
  })
  it('a text field that a spreadsheet would run as a formula starts with a quote; numbers stay as they are', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', 'Plain', -3]])).toBe('\uFEFF"\'=HYPERLINK(""x"")",\'+1,\'-2,\'@SUM(A1),Plain,-3')
  })
  it('a formula after spaces is kept as text', () => {
    expect(toCsv([['  =SUM(A1)']])).toBe("\uFEFF'  =SUM(A1)")
  })
})


describe('downloadCsv', () => {
  afterEach(() => vi.restoreAllMocks())

  /** The bytes of the file that would be saved. */
  async function saved(csv: string) {
    let blob: Blob | undefined
    URL.createObjectURL = vi.fn((b: Blob) => ((blob = b), 'blob:x'))
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadCsv('log.csv', csv)
    return new Uint8Array(await blob!.arrayBuffer())
  }

  it('starts the file with one BOM, whether or not the text had it (fetch drops a server CSV’s)', async () => {
    for (const csv of ['\uFEFFa,b', 'a,b']) {
      expect([...(await saved(csv))]).toEqual([0xef, 0xbb, 0xbf, 0x61, 0x2c, 0x62])
    }
  })
})
