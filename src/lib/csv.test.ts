import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

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

