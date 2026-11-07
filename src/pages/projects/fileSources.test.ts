import { describe, expect, it } from 'vitest'
import type { Attachment } from '@/api/types'
import { filterOf, sourceLabel, typeLabel } from './fileSources'

describe('Files tab helpers', () => {
  it('says where a file came from', () => {
    expect(sourceLabel({ kind: 'task', taskKey: 'NEX-108' })).toBe('NEX-108 · Attachment')
    expect(sourceLabel({ kind: 'comment', taskKey: 'NEX-105', commentId: 'c1', bug: false })).toBe('NEX-105 · Comment')
    expect(sourceLabel({ kind: 'comment', taskKey: 'NEX-105', commentId: 'c1', bug: true })).toBe('NEX-105 · Bug')
    expect(sourceLabel({ kind: 'chat', messageId: 'm1', replyId: null })).toBe('Chat')
    expect(sourceLabel({ kind: 'overview' })).toBe('Overview')
  })

  it('reads the filter from the address, ignoring what it doesn’t know', () => {
    expect(filterOf(new URLSearchParams('from=chat&type=pdf'))).toEqual({ from: 'chat', type: 'pdf' })
    expect(filterOf(new URLSearchParams('from=mail&type=exe'))).toEqual({})
    expect(filterOf(new URLSearchParams(''))).toEqual({})
  })

  it('names a file’s type by its extension', () => {
    expect(typeLabel({ name: 'scope.pdf' } as Attachment)).toBe('PDF')
    expect(typeLabel({ name: 'notes' } as Attachment)).toBe('—')
  })
})
