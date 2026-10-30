import type { Api, SidebarSection } from '@/api/types'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { badRequest, clone, currentUser, notFound } from './shared'

const SECTIONS: SidebarSection[] = ['starred', 'channels']

/**
 * Takes a channel out of this person's orders (it was starred, unstarred, or left): it comes back at the end of its new
 * section, as a row the order doesn't know (spec 5.1). True when an order changed.
 */
export function forgetInOrder(data: DbData, userId: string, channelId: string): boolean {
  let changed = false
  for (const order of data.sidebarOrders) {
    if (order.userId !== userId || !order.channelIds.includes(channelId)) continue
    order.channelIds = order.channelIds.filter((id) => id !== channelId)
    changed = true
  }
  data.sidebarOrders = data.sidebarOrders.filter((o) => o.channelIds.length > 0)
  return changed
}
const MAX_IDS = 500

/**
 * My order of the sidebar's Starred and Channels sections (spec 5.1), per workspace. Only ids of channels and DMs I
 * may list there are kept, each once; an empty list goes back to the default order.
 */
export function sidebarApi(db: MockDb, hub: MockHub): Api['sidebar'] {
  return {
    async order(workspaceId) {
      await delay()
      const data = await db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      const me = currentUser(data).id
      const of = (section: SidebarSection) => data.sidebarOrders.find((o) => o.userId === me && o.workspaceId === workspaceId && o.section === section)?.channelIds ?? []
      return clone({ starred: of('starred'), channels: of('channels') })
    },
    async setOrder(workspaceId, section, channelIds) {
      await delay()
      if (!SECTIONS.includes(section)) throw badRequest('Pick Starred or Channels.')
      if (!Array.isArray(channelIds) || channelIds.length > MAX_IDS) throw badRequest(`An order has at most ${MAX_IDS} channels.`)
      const userId = await db.update((data) => {
        if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
        const me = currentUser(data).id
        const listable = new Set(data.channels.filter((c) => c.workspaceId === workspaceId && (!c.isPrivate || c.memberIds.includes(me))).map((c) => c.id))
        const ids = [...new Set(channelIds.filter((id) => typeof id === 'string' && listable.has(id)))]
        const id = `${me}:${workspaceId}:${section}`
        data.sidebarOrders = data.sidebarOrders.filter((o) => o.id !== id)
        if (ids.length) data.sidebarOrders.push({ id, userId: me, workspaceId, section, channelIds: ids })
        return me
      })
      hub.publish({ type: 'sidebarChanged', userId })
    },
  }
}
