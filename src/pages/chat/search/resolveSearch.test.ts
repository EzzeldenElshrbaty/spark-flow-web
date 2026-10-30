import { describe, expect, it } from 'vitest'
import type { Channel, User } from '@/api/types'
import { parseQuery } from '@/lib/searchQuery'
import { channelScope, handleOf, resolveSearch } from './resolveSearch'

const users = [
  { id: 'u-1', name: 'Youssef Abdelrahman', email: 'youssef.abdelrahman@spark-sys.com' },
  { id: 'u-2', name: 'Nour El-Sayed', email: 'nour.elsayed@spark-sys.com' },
  { id: 'u-5', name: 'Nour Hassan', email: 'n.hassan@spark-sys.com' },
] as User[]
const ch = (id: string, kind: 'channel' | 'dm', name: string | null, memberIds: string[]) => ({ id, kind, name, memberIds }) as Channel
const channels = [ch('c-backend', 'channel', 'backend', ['u-1', 'u-2']), ch('c-dm-1', 'dm', null, ['u-1', 'u-2']), ch('c-group', 'dm', null, ['u-1', 'u-2', 'u-5'])]
const resolve = (q: string) => resolveSearch(parseQuery(q), { users, channels, meId: 'u-1' })

describe('resolveSearch (the page turns names into ids before it asks)', () => {
  it('sends the words and phrases as text, and the filters by id', () => {
    expect(resolve('deploy "page size" from:@nour.el in:#Backend has:link is:thread after:2026-10-01')).toEqual({
      request: { q: 'deploy "page size"', from: ['u-2'], in: 'c-backend', has: 'link', thread: true, after: '2026-10-01', before: null },
      problems: [],
    })
  })
  it('from:@nour is everyone it fits; in:@nour is my 1:1 DM with them', () => {
    expect(resolve('from:@nour').request?.from).toEqual(['u-2', 'u-5'])
    expect(resolve('in:@nour.elsayed').request?.in).toBe('c-dm-1')
  })
  it('in:@ takes the exact handle over a longer one that starts the same (Sam, not Samir)', () => {
    const more = [...users, { id: 'u-7', name: 'Sam Adel', email: 'sam@spark-sys.com' }, { id: 'u-8', name: 'Samir Ali', email: 'samir@spark-sys.com' }] as User[]
    const dms = [...channels, ch('c-dm-samir', 'dm', null, ['u-1', 'u-8']), ch('c-dm-sam', 'dm', null, ['u-1', 'u-7'])]
    expect(resolveSearch(parseQuery('in:@sam'), { users: more, channels: dms, meId: 'u-1' }).request?.in).toBe('c-dm-sam')
    expect(resolveSearch(parseQuery('in:@sa'), { users: more, channels: dms, meId: 'u-1' }).problems).toEqual(['More than one person matches @sa.'])
  })
  it('says what it can’t find, and asks nothing then', () => {
    expect(resolve('x from:@zed in:#nowhere')).toEqual({ request: null, problems: ['No one matches @zed.', 'No channel is called #nowhere.'] })
    expect(resolve('in:@n.hassan').problems).toEqual(['You have no conversation with Nour Hassan.'])
  })
  it('an empty query asks nothing', () => {
    expect(resolve('  ')).toEqual({ request: null, problems: [] })
  })
})

describe('channelScope (the channel header’s 🔍 and ⌘F)', () => {
  it('a channel by name, a 1:1 DM by the other person; a group DM has none', () => {
    expect(channelScope(channels[0], users, 'u-1')).toBe('in:#backend ')
    expect(channelScope(channels[1], users, 'u-1')).toBe('in:@nour.elsayed ')
    expect(channelScope(channels[2], users, 'u-1')).toBeNull()
  })
  it('handleOf is the email name, else the first name', () => {
    expect(handleOf({ name: 'Nour El-Sayed', email: 'nour.elsayed@spark-sys.com' })).toBe('nour.elsayed')
    expect(handleOf({ name: 'Flowbot', email: '' })).toBe('flowbot')
  })
})
