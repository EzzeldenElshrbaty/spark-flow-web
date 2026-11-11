import type { Api, Bookmark } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { appPath } from '@/lib/appLink'
import { webAddress } from '@/lib/webAddress'
import { checkCanWrite, findChannel, readableChannel } from './chat'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import type { MockHub } from './realtime'
import { badRequest, clone, notFound } from './shared'

const TITLE_MAX = 60

/** A bookmark's address (http or https only) and title (the host when left empty). */
function checked(input: { title?: string; url?: string }, current?: Bookmark): { title: string; url: string } {
  // An address on Flow's own origin (Link a project, chat spec 6.14) is a bookmark too, even on a dotless host.
  const url = input.url === undefined && current ? current.url : (webAddress(input.url ?? '') ?? (appPath(input.url ?? '') ? input.url! : null))
  if (!url) throw badRequest('Use a web address (https://…).')
  const title = (input.title === undefined && current ? current.title : (input.title ?? '').trim()) || new URL(url).hostname
  if (title.length > TITLE_MAX) throw badRequest(`Keep the name under ${TITLE_MAX} characters.`)
  return { title, url }
}

/** A channel holds each address once (polish pass): two quick Link a project picks make one bookmark. */
function checkNew(data: DbData, channelId: string, url: string, id?: string) {
  if (data.bookmarks.some((b) => b.channelId === channelId && b.url === url && b.id !== id))
    throw new ApiError({ title: 'Conflict', status: 409, detail: 'That link is already a bookmark here.' })
}

/** Channel bookmarks (spec 6.1): links after the tabs, in the order added; whoever may post manages them. */
export function bookmarksApi(db: MockDb, hub: MockHub): Api['bookmarks'] {
  const changed = (channelId: string) => hub.publish({ type: 'channelChanged', channelId })
  const mine = (data: DbData, id: string) => {
    const bookmark = data.bookmarks.find((b) => b.id === id)
    if (!bookmark) throw notFound('Bookmark', id)
    readableChannel(data, bookmark.channelId)
    checkCanWrite(data, findChannel(data, bookmark.channelId))
    return bookmark
  }
  return {
    async list(channelId) {
      await delay()
      const data = await db.read()
      readableChannel(data, channelId)
      return clone(data.bookmarks.filter((b) => b.channelId === channelId))
    },
    async add(channelId, input) {
      await delay()
      const bookmark = await db.update((data) => {
        readableChannel(data, channelId)
        const me = checkCanWrite(data, findChannel(data, channelId))
        const made: Bookmark = { id: crypto.randomUUID(), channelId, ...checked(input), createdBy: me.id, createdAt: new Date().toISOString() }
        checkNew(data, channelId, made.url)
        data.bookmarks.push(made)
        return made
      })
      changed(channelId)
      return clone(bookmark)
    },
    async update(id, patch) {
      await delay()
      const bookmark = await db.update((data) => {
        const found = mine(data, id)
        const next = checked(patch, found)
        checkNew(data, found.channelId, next.url, found.id)
        Object.assign(found, next)
        return found
      })
      changed(bookmark.channelId)
      return clone(bookmark)
    },
    async remove(id) {
      await delay()
      const channelId = await db.update((data) => {
        const found = mine(data, id)
        data.bookmarks = data.bookmarks.filter((b) => b !== found)
        return found.channelId
      })
      changed(channelId)
    },
  }
}
