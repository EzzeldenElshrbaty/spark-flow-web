import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('quotes commas, quotes and newlines; BOM; CRLF', () => {
    expect(toCsv([['Project', 'Hours'], ['Nexus, Core', 12.5], ['Say "hi"', 'two\nlines']])).toBe('﻿Project,Hours\r\n"Nexus, Core",12.5\r\n"Say ""hi""","two\nlines"')
  })
})
