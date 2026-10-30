import { describe, expect, it } from 'vitest'
import { reminderLink } from '@/pages/chat/saved/FlowbotReminder'

describe('reminderLink (review)', () => {
  it('a saved file opens its details beside the channel it was shared in', () => {
    expect(reminderLink({ kind: 'reminder', savedId: 's', channelId: 'c-backend', rootId: null, target: { kind: 'file', id: 'a1' } }, 'engineering')).toBe('/w/engineering/c/c-backend?file=a1')
  })
})
