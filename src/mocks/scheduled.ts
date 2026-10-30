import type { Api, ScheduledMessage } from '@/api/types'
import { checkBody, checkCanWrite, findChannel, findMessage } from './chat'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { sendScheduled } from './scheduler'
import { badRequest, clone, currentUser, newId, notFound } from './shared'

/** Scheduled send (spec 6.8, §7 ScheduledMessage): kept to go out at its time, as its author. */
export function scheduledApi(db: MockDb, hub: MockHub, now: () => Date): Api['scheduled'] {
  const future = (value: unknown): string => {
    const time = typeof value === 'string' ? Date.parse(value) : NaN
    if (Number.isNaN(time)) throw badRequest('Pick a date and time.')
    if (time <= now().getTime()) throw badRequest('Pick a time in the future.')
    return new Date(time).toISOString()
  }
  /** One of mine, or 404: nobody learns someone else's exists. */
  const mine = (data: DbData, id: string) => {
    const item = data.scheduled.find((s) => s.id === id && s.userId === data.currentUserId)
    if (!item) throw notFound('Scheduled message', id)
    return item
  }
  const changed = (userId: string) => hub.publish({ type: 'scheduledChanged', userId })

  return {
    async list(workspaceId) {
      await delay()
      const data = await db.read()
      const me = currentUser(data)
      return clone(data.scheduled.filter((s) => s.userId === me.id && s.workspaceId === workspaceId && s.status !== 'sent').sort((a, b) => a.sendAt.localeCompare(b.sendAt)))
    },
    async create(input) {
      await delay()
      const item = await db.update((data) => {
        const channel = findChannel(data, input.channelId)
        // What a send checks, now, so a message that can't go out isn't kept (the scheduler checks again at its time).
        const me = checkCanWrite(data, channel)
        if (input.rootId && findMessage(data, input.rootId).channelId !== channel.id) throw notFound('Message', input.rootId)
        const { body, text } = checkBody(input.body)
        const created: ScheduledMessage = {
          id: newId('sch'), userId: me.id, workspaceId: channel.workspaceId, channelId: channel.id, rootId: input.rootId ?? null,
          content: text, body, sendAt: future(input.sendAt), tz: typeof input.tz === 'string' ? input.tz : 'UTC', status: 'scheduled', sentId: null, failure: null,
        }
        data.scheduled.push(created)
        return created
      })
      changed(item.userId)
      return clone(item)
    },
    async update(id, patch) {
      await delay()
      const item = await db.update((data) => {
        const found = mine(data, id)
        if (found.status === 'sent') throw badRequest('That message was already sent.')
        if (patch.body !== undefined) Object.assign(found, (({ body, text }) => ({ body, content: text }))(checkBody(patch.body)))
        if (patch.sendAt !== undefined) {
          found.sendAt = future(patch.sendAt)
          found.status = 'scheduled'
          found.failure = null
        }
        return { ...found }
      })
      changed(item.userId)
      return clone(item)
    },
    async remove(id) {
      await delay()
      const userId = await db.update((data) => {
        const found = mine(data, id)
        data.scheduled = data.scheduled.filter((s) => s !== found)
        return found.userId
      })
      changed(userId)
    },
    async sendNow(id) {
      await delay()
      const { row, events } = await db.update((data) => {
        const found = mine(data, id)
        if (found.status === 'sent') throw badRequest('That message was already sent.')
        const sent = sendScheduled(data, found)
        // Refused: nothing is saved (the transaction is dropped), and the refusal's reason goes back.
        if ('failure' in sent) throw badRequest(sent.failure)
        return sent
      })
      for (const event of events) hub.publish(event)
      return clone(row)
    },
  }
}
