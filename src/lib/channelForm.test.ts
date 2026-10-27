import { describe, expect, it } from 'vitest'
import { channelFormErrors } from './channelForm'

const ok = { name: 'design', topic: '', isPrivate: false, memberIds: [] as string[] }

describe('channelFormErrors', () => {
  it('a good channel has no errors', () => {
    expect(channelFormErrors(ok, ['general'])).toEqual({})
  })
  it('the name: needed, the pattern, unique', () => {
    expect(channelFormErrors({ ...ok, name: '' }, []).name).toBe('Give the channel a name.')
    expect(channelFormErrors({ ...ok, name: 'Design Team' }, []).name).toBe('Use lowercase letters, numbers and hyphens.')
    expect(channelFormErrors({ ...ok, name: 'general' }, ['general']).name).toBe('That name is taken.')
  })
  it('the topic: under 250 characters', () => {
    expect(channelFormErrors({ ...ok, topic: 'x'.repeat(251) }, []).topic).toBe('Keep the topic under 250 characters.')
  })
  it('a private channel needs someone besides you', () => {
    expect(channelFormErrors({ ...ok, isPrivate: true }, []).members).toBe('Add at least one person.')
  })
})
