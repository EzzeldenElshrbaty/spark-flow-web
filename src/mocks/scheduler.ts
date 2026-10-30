import type { ChatMessage, FlowbotNote, SavedItem, ScheduledMessage, StoredChannel, ThreadReply } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { FLOWBOT_ID, senderName } from '@/lib/flowbot'
import type { Body } from '@/lib/messageBody'
import type { RealtimeEvent } from '@/lib/realtime'
import { postMessage, writeMessage, writeReply } from './chat'
import type { DbData, MockDb } from './db'
import { canRead } from './membership'
import { rowText, savedRow } from './saved'
import type { MockHub } from './realtime'
import { clone, newId } from './shared'

/** How often the prototype looks for due reminders and scheduled messages (a server would run a job queue). */
export const SCHEDULER_EVERY_MS = 15_000

const QUOTE_MAX = 150

/** Runs fn as this person (posts and their checks read currentUserId); the document's person is put back after. */
function asUser<T>(data: DbData, userId: string, fn: () => T): T {
  const was = data.currentUserId
  data.currentUserId = userId
  try {
    return fn()
  } finally {
    data.currentUserId = was
  }
}

/** A person's DM with Flowbot in a workspace, made the first time Flowbot has something to say there. */
function flowbotDm(data: DbData, workspaceId: string, userId: string): { channel: StoredChannel; created: boolean } {
  const found = data.channels.find((c) => c.workspaceId === workspaceId && c.kind === 'dm' && c.memberIds.length === 2 && c.memberIds.includes(FLOWBOT_ID) && c.memberIds.includes(userId))
  if (found) return { channel: found, created: false }
  const channel: StoredChannel = {
    id: newId('c'), workspaceId, kind: 'dm', name: null, topic: '', description: '', whoCanPost: 'everyone', isDefault: false,
    memberIds: [userId, FLOWBOT_ID], isPrivate: true, lastMessageAt: null,
  }
  data.channels.push(channel)
  return { channel, created: true }
}

const plain = (text: string): Body => [{ type: 'p', children: [{ type: 'text', text }] }]

/** Flowbot tells `userId` something in their DM; the events that announce it. */
function tell(data: DbData, workspaceId: string, userId: string, content: string, note: FlowbotNote): RealtimeEvent[] {
  const { channel, created } = flowbotDm(data, workspaceId, userId)
  // Plain text, so a quoted mention or task key is shown as written and notifies nobody.
  const message = asUser(data, FLOWBOT_ID, () => postMessage(data, { channelId: channel.id, content, body: plain(content) }))
  message.flowbot = note
  return [...(created ? [{ type: 'channelChanged' as const, channelId: channel.id }] : []), { type: 'messageReceived', message: clone(message) }]
}

/** What Flowbot says when a reminder fires: the message quoted with who wrote it, unless it's gone or out of reach. */
function reminderText(data: DbData, item: SavedItem): string {
  if (item.target.kind === 'note') return `Reminder: “${quoted(item.target.text)}”.`
  const found = savedRow(data, item.target)
  if (!found || found.row.deletedAt) return 'Reminder about a message that was deleted.'
  if (!canRead(data, found.channelId, item.userId)) return 'Reminder about a message you can no longer see.'
  return `Reminder: “${quoted(rowText(found.row))}” from ${senderName(found.row.senderId, data.users)}.`
}

const quoted = (text: string) => (text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1).trimEnd()}…` : text)

/**
 * Fires a saved item's reminder: Flowbot's DM card, and an Activity item under Reminders (spec 6.12) while its owner
 * can still read the message. The item stays In progress.
 */
function fireReminder(data: DbData, item: SavedItem, at: string): RealtimeEvent[] {
  item.firedAt = at
  const found = savedRow(data, item.target)
  const readable = found && !found.row.deletedAt && canRead(data, found.channelId, item.userId)
  if (readable) {
    data.notifications.push({ id: newId('n'), userId: item.userId, kind: 'reminder', actorId: FLOWBOT_ID, channelId: found.channelId, messageId: found.messageId, replyId: found.replyId, emoji: null, at, read: false })
  }
  const note: FlowbotNote = { kind: 'reminder', savedId: item.id, channelId: found?.channelId ?? '', rootId: found?.replyId ? found.messageId : null, target: item.target }
  return [
    ...tell(data, item.workspaceId, item.userId, reminderText(data, item), note),
    { type: 'savedChanged', userId: item.userId },
    ...(readable ? [{ type: 'notificationCreated' as const, userId: item.userId }] : []),
  ]
}

/** Sends a scheduled message as its author, marking it sent; the reason it can't be sent, if it can't. */
export function sendScheduled(data: DbData, item: ScheduledMessage): { row: ChatMessage | ThreadReply; events: RealtimeEvent[] } | { failure: string } {
  try {
    return asUser(data, item.userId, () => {
      const input = { content: item.content, body: item.body }
      const sent: { row: ChatMessage | ThreadReply; events: RealtimeEvent[] } = item.rootId
        ? (({ reply, notified }) => ({
            row: reply,
            events: [{ type: 'replyReceived' as const, reply: clone(reply) }, ...notified.map((userId) => ({ type: 'notificationCreated' as const, userId }))],
          }))(writeReply(data, { ...input, messageId: item.rootId }))
        : (({ message, mentioned }) => ({
            row: message,
            events: [{ type: 'messageReceived' as const, message: clone(message) }, ...mentioned.map((userId) => ({ type: 'notificationCreated' as const, userId }))],
          }))(writeMessage(data, { ...input, channelId: item.channelId }))
      item.status = 'sent'
      item.sentId = sent.row.id
      item.failure = null
      return { row: sent.row, events: [...sent.events, { type: 'scheduledChanged' as const, userId: item.userId }] }
    })
  } catch (error) {
    return { failure: error instanceof ApiError ? (error.detail ?? error.message) : (error as Error).message }
  }
}

/** Where a scheduled message was going, as its author would say it. */
function destination(data: DbData, item: ScheduledMessage): string {
  const channel = data.channels.find((c) => c.id === item.channelId)
  const place = channel?.kind === 'channel' ? `#${channel.name}` : 'a conversation'
  return item.rootId ? `a thread in ${place}` : place
}

/**
 * Fires every reminder and sends every scheduled message that is due at `now`, inside one transaction, so each fires
 * once however many tabs run it. Returns how many it handled and the events to publish.
 */
export function fireDue(data: DbData, now: Date): { handled: number; events: RealtimeEvent[] } {
  const at = now.toISOString()
  const events: RealtimeEvent[] = []
  let handled = 0
  for (const item of data.saved) {
    if (item.status !== 'inProgress' || !item.remindAt || item.firedAt || item.remindAt > at) continue
    events.push(...fireReminder(data, item, at))
    handled++
  }
  for (const item of data.scheduled) {
    if (item.status !== 'scheduled' || item.sendAt > at) continue
    const sent = sendScheduled(data, item)
    if ('failure' in sent) {
      item.status = 'failed'
      item.failure = sent.failure
      const line = `Your scheduled message to ${destination(data, item)} wasn’t sent. ${sent.failure}`
      events.push(...tell(data, item.workspaceId, item.userId, line, { kind: 'scheduleFailed', scheduledId: item.id }), { type: 'scheduledChanged', userId: item.userId })
    } else {
      events.push(...sent.events)
    }
    handled++
  }
  return { handled, events }
}

/** One scheduler pass: fires what is due, then tells every tab. Resolves to how many it handled. */
export async function runScheduler(db: MockDb, hub: MockHub, now: Date = new Date()): Promise<number> {
  const { handled, events } = await db.update((data) => fireDue(data, now))
  for (const event of events) hub.publish(event)
  return handled
}

/** Runs the scheduler now and every SCHEDULER_EVERY_MS until the returned stop is called; a pass never overlaps another. */
export function startScheduler(db: MockDb, hub: MockHub, now: () => Date = () => new Date()): () => void {
  let running = false
  const pass = () => {
    if (running) return
    running = true
    runScheduler(db, hub, now())
      .catch((error) => console.error('The scheduler pass failed.', error))
      .finally(() => {
        running = false
      })
  }
  pass()
  const timer = setInterval(pass, SCHEDULER_EVERY_MS)
  return () => clearInterval(timer)
}

