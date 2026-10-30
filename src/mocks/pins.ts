import type { Api } from '@/api/types'
import { checkCanPost, findChannel, findMessage, postSystem, readableChannel, withThread } from './chat'
import type { MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { badRequest, clone } from './shared'

/**
 * Pins (spec 6.5 Pin to channel, 6.1 Pins tab, §7 Pin): whoever may post in a channel pins and unpins its messages;
 * pinning says so in the channel. A message's `pin` and the channel's list are worked out from these records on read.
 */
export function pinsApi(db: MockDb, hub: MockHub): Api['pins'] {
  const changed = (channelId: string, messageId: string) => {
    hub.publish({ type: 'messageChanged', channelId, messageId })
    hub.publish({ type: 'channelChanged', channelId })
  }
  return {
    async list(channelId) {
      await delay()
      const data = await db.read()
      readableChannel(data, channelId)
      return clone(
        data.pins
          .filter((p) => p.channelId === channelId)
          .sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt))
          .flatMap((p) => {
            const message = data.messages.find((m) => m.id === p.messageId)
            return message ? [{ message: withThread(data, message), pinnedBy: p.pinnedBy, pinnedAt: p.pinnedAt }] : []
          }),
      )
    },
    async pin(messageId) {
      await delay()
      const result = await db.update((data) => {
        const message = findMessage(data, messageId)
        const channel = findChannel(data, message.channelId)
        const me = checkCanPost(data, channel)
        if (message.deletedAt) throw badRequest('This message was deleted.')
        if (message.system || message.broadcast) throw badRequest("This message can't be pinned.")
        if (data.pins.some((p) => p.messageId === messageId)) return { channelId: channel.id, line: null }
        data.pins.push({ channelId: channel.id, messageId, pinnedBy: me.id, pinnedAt: new Date().toISOString() })
        return { channelId: channel.id, line: postSystem(data, channel.id, { kind: 'pinned', messageId }) }
      })
      if (result.line) hub.publish({ type: 'messageReceived', message: clone(result.line) })
      changed(result.channelId, messageId)
    },
    async unpin(messageId) {
      await delay()
      const channelId = await db.update((data) => {
        const message = findMessage(data, messageId)
        const channel = findChannel(data, message.channelId)
        checkCanPost(data, channel)
        data.pins = data.pins.filter((p) => p.messageId !== messageId)
        return channel.id
      })
      changed(channelId, messageId)
    },
  }
}
