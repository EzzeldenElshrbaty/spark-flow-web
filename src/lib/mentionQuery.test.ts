import { describe, expect, it } from 'vitest'
import type { User } from '@/api/types'
import { activeMention, insertMention, keepDismissed, mentionOptions } from './mentionQuery'

const user = (id: string, name: string, title = '') => ({ id, name, title }) as User
const from = {
  users: [user('u-4', 'Ahmed Shawky', 'Project Manager'), user('u-2', 'Nour El-Sayed', 'Project Manager'), user('u-3', 'Mariam Fathy', 'Frontend Engineer')],
  projects: [{ key: 'NEX', name: 'Nexus Core' }, { key: 'MOB', name: 'Mobile App' }],
  tasks: Array.from({ length: 10 }, (_, i) => ({ key: `NEX-${101 + i}`, title: `Task ${i}` })),
}

describe('activeMention', () => {
  it('opens only at a word start, with no space before the caret', () => {
    expect(activeMention('hi @no', 6)).toEqual({ start: 3, query: 'no' })
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' })
    expect(activeMention('(@NE', 4)).toEqual({ start: 1, query: 'NE' })
    expect(activeMention('a@b', 3)).toBeNull() // an e-mail
    expect(activeMention('hi @no x', 8)).toBeNull() // closed by a space
    expect(activeMention('hi @' + 'x'.repeat(31), 35)).toBeNull() // too long to be a mention
    expect(activeMention('hi @no there', 6)).toEqual({ start: 3, query: 'no' }) // caret in the middle of the text
  })
})

describe('mentionOptions', () => {
  it('@all first, then people, projects and tasks; word-prefix match; at most 8', () => {
    const a = mentionOptions('a', from)
    expect(a[0]).toEqual({ kind: 'all' })
    expect(a[1]).toMatchObject({ kind: 'user', id: 'u-4' })
    expect(a.some((o) => o.kind === 'project' && o.key === 'MOB')).toBe(true) // "Mobile App"
    const nex = mentionOptions('nex', from)
    expect(nex[0]).toMatchObject({ kind: 'project', key: 'NEX' })
    expect(nex.slice(1).every((o) => o.kind === 'task')).toBe(true)
    expect(nex).toHaveLength(8)
    expect(mentionOptions('fat', from)).toEqual([{ kind: 'user', id: 'u-3', name: 'Mariam Fathy', title: 'Frontend Engineer' }])
    expect(mentionOptions('', from)).toHaveLength(8)
  })
})

describe('insertMention', () => {
  it('replaces just the @query and puts the caret after the mention', () => {
    expect(insertMention('hi @no', { start: 3, caret: 6 }, { kind: 'user', id: 'u-2', name: 'Nour El-Sayed', title: '' })).toEqual({ text: 'hi @[Nour El-Sayed](u-2) ', caret: 25 })
    expect(insertMention('see @NE then', { start: 4, caret: 7 }, { kind: 'task', key: 'NEX-101', title: '' })).toEqual({ text: 'see @NEX-101 then', caret: 13 }) // the space already there is kept, not doubled
    expect(insertMention('@a', { start: 0, caret: 2 }, { kind: 'all' })).toEqual({ text: '@all ', caret: 5 })
    expect(insertMention('@n', { start: 0, caret: 2 }, { kind: 'project', key: 'NEX', name: 'Nexus Core' })).toEqual({ text: '@NEX ', caret: 5 })
  })
})

describe('keepDismissed', () => {
  it('a closed list stays closed for that @word only', () => {
    expect(keepDismissed(3, 3)).toBe(3) // still typing the same @word
    expect(keepDismissed(3, null)).toBeNull() // the @word is gone (deleted, sent, or a space ended it)
    expect(keepDismissed(3, 10)).toBeNull() // a new @ elsewhere opens the list again
    expect(keepDismissed(null, 4)).toBeNull()
  })
})
