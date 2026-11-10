import type { Api, PageHold, PageVersion, PageView, StoredPage } from '@/api/types'
import { ApiError } from '@/lib/apiError'
import { PAGE_HOLD_MS, PAGE_RUN_MS, PAGE_VERSIONS_KEPT, blockText, pageMentions, pageTooLong, validPage, type PageBody } from '@/lib/pageBody'
import { checkCanWrite, findChannel, readableChannel } from './chat'
import type { DbData, MockDb } from './db'
import { delay } from './latency'
import { canRead } from './membership'
import type { MockHub } from './realtime'
import { badRequest, clone, excerptOf, newId, notFound } from './shared'

const EDITORS_SHOWN = 10

const conflict = (detail: string) => new ApiError({ title: 'Conflict', status: 409, detail })
const nameOf = (data: DbData, userId: string) => data.users.find((u) => u.id === userId)?.name ?? 'Someone'
const same = (a: PageBody, b: PageBody) => JSON.stringify(a) === JSON.stringify(b)

/** A channel's page (chat spec 6.14, rules in the spec's §5): one editor at a time, a version check, history, mentions. */
export function pagesApi(db: MockDb, hub: MockHub, now: () => Date): Api['pages'] {
  /** The hold while it lasts; one past its time counts as none. */
  const holdOf = (page: StoredPage | undefined): PageHold | null => (page?.editing && Date.parse(page.editing.until) > now().getTime() ? page.editing : null)
  const pageOf = (data: DbData, channelId: string) => data.pages.find((p) => p.channelId === channelId)
  const versionsOf = (data: DbData, page: StoredPage | undefined) =>
    page ? data.pageVersions.filter((v) => v.pageId === page.id).sort((a, b) => b.version - a.version) : []

  function viewOf(data: DbData, channelId: string): PageView {
    const page = pageOf(data, channelId)
    const editors = [...new Set(versionsOf(data, page).map((v) => v.savedBy))].slice(0, EDITORS_SHOWN)
    return {
      channelId, body: page?.body ?? [], version: page?.version ?? 0, updatedAt: page?.updatedAt ?? null, updatedBy: page?.updatedBy ?? null,
      editors, editing: holdOf(page),
    }
  }

  /** The page, made on the first claim or save. */
  function pageFor(data: DbData, channelId: string, userId: string): StoredPage {
    const found = pageOf(data, channelId)
    if (found) return found
    const at = now().toISOString()
    const page: StoredPage = {
      id: newId('pg'), channelId, workspaceId: findChannel(data, channelId).workspaceId, body: [], version: 0,
      createdAt: at, createdBy: userId, updatedAt: null, updatedBy: null, editing: null,
    }
    data.pages.push(page)
    return page
  }

  /** Whoever may post here, as the caller; a reader gets 403, an archived channel its 400. */
  function editor(data: DbData, channelId: string) {
    readableChannel(data, channelId)
    return checkCanWrite(data, findChannel(data, channelId))
  }

  const hold = (page: StoredPage, userId: string) => {
    page.editing = { userId, until: new Date(now().getTime() + PAGE_HOLD_MS).toISOString() }
  }

  /** The 409s a save or restore can meet, in the spec's order (§5.3): another person's hold, then a newer version. */
  function checkTurn(data: DbData, page: StoredPage, meId: string, baseVersion: number, restoring: boolean) {
    const holder = holdOf(page)
    if (holder && holder.userId !== meId) {
      const name = nameOf(data, holder.userId)
      throw conflict(restoring ? `${name} is editing. Try again when they’re done.` : `${name} started editing first. Your last changes aren’t saved.`)
    }
    if (baseVersion !== page.version) {
      if (page.updatedBy === meId) throw conflict(restoring ? 'You changed this page in another tab. Try again.' : 'You changed this page in another tab. Your last changes here aren’t saved.')
      const name = nameOf(data, page.updatedBy ?? '')
      throw conflict(restoring ? `${name} saved changes before you. Try again.` : `${name} saved changes before you. Your last changes aren’t saved.`)
    }
  }

  /**
   * Writes the body as the next version: my run of saves within 10 minutes is one history entry (a restore always
   * starts its own), the newest 100 are kept, and people it newly names who can read the channel hear about it.
   */
  function write(data: DbData, page: StoredPage, body: PageBody, meId: string, newRun: boolean): string[] {
    const before = new Set(pageMentions(page.body))
    const at = now().toISOString()
    page.body = body
    page.version += 1
    page.updatedAt = at
    page.updatedBy = meId
    hold(page, meId)

    const [latest] = versionsOf(data, page)
    if (!newRun && latest && latest.savedBy === meId && now().getTime() - Date.parse(latest.firstSavedAt) < PAGE_RUN_MS) {
      Object.assign(latest, { version: page.version, body: clone(body), savedAt: at })
    } else {
      const version: PageVersion = { id: newId('pv'), pageId: page.id, version: page.version, body: clone(body), savedBy: meId, firstSavedAt: at, savedAt: at }
      data.pageVersions.push(version)
      const dropped = new Set(versionsOf(data, page).slice(PAGE_VERSIONS_KEPT))
      if (dropped.size) data.pageVersions = data.pageVersions.filter((v) => !dropped.has(v))
    }

    const named = pageMentions(body).filter((id) => {
      const user = data.users.find((u) => u.id === id)
      return !before.has(id) && id !== meId && user && !user.deactivated && canRead(data, page.channelId, id)
    })
    for (const userId of named) {
      const block = body.find((b) => pageMentions([b]).includes(userId))!
      data.pageMentions.push({ id: newId('pm'), pageId: page.id, channelId: page.channelId, workspaceId: page.workspaceId, userId, authorId: meId, excerpt: excerptOf(blockText(block)), createdAt: at })
    }
    return named
  }

  function published(channelId: string, version: number, userId: string, named: string[]) {
    hub.publish({ type: 'pageSaved', channelId, version, userId })
    for (const id of named) hub.publish({ type: 'notificationCreated', userId: id })
  }

  return {
    async get(channelId) {
      await delay()
      const data = await db.read()
      readableChannel(data, channelId)
      return clone(viewOf(data, channelId))
    },
    async editing(channelId) {
      await delay()
      const { editing, changed } = await db.update((data) => {
        const me = editor(data, channelId)
        const page = pageFor(data, channelId, me.id)
        const holder = holdOf(page)
        if (holder && holder.userId !== me.id) return { editing: holder, changed: false }
        hold(page, me.id)
        return { editing: page.editing!, changed: !holder }
      })
      if (changed) hub.publish({ type: 'pageEditing', channelId, userId: editing.userId, until: editing.until })
      return { editing: clone(editing) }
    },
    async stopEditing(channelId) {
      await delay()
      const released = await db.update((data) => {
        readableChannel(data, channelId)
        const page = pageOf(data, channelId)
        if (!page || holdOf(page)?.userId !== data.currentUserId) return false
        page.editing = null
        return true
      })
      if (released) hub.publish({ type: 'pageEditing', channelId, userId: null, until: null })
    },
    async save(channelId, { body, baseVersion }) {
      await delay()
      const result = await db.update((data) => {
        const me = editor(data, channelId)
        const valid = validPage(body)
        if (!valid) throw badRequest(pageTooLong(body) ? 'This page is too long. Shorten it to save.' : 'Something on this page can’t be saved.')
        const page = pageFor(data, channelId, me.id)
        checkTurn(data, page, me.id, baseVersion, false)
        if (page.version > 0 && same(page.body, valid)) {
          hold(page, me.id)
          return { view: viewOf(data, channelId), named: null }
        }
        const named = write(data, page, valid, me.id, false)
        return { view: viewOf(data, channelId), named }
      })
      if (result.named) published(channelId, result.view.version, result.view.updatedBy!, result.named)
      return clone(result.view)
    },
    async history(channelId) {
      await delay()
      const data = await db.read()
      readableChannel(data, channelId)
      return versionsOf(data, pageOf(data, channelId)).map(({ id, version, savedAt, savedBy }) => ({ id, version, savedAt, savedBy }))
    },
    async version(channelId, versionId) {
      await delay()
      const data = await db.read()
      readableChannel(data, channelId)
      const found = versionsOf(data, pageOf(data, channelId)).find((v) => v.id === versionId)
      if (!found) throw notFound('Page version', versionId)
      return clone({ id: found.id, version: found.version, savedAt: found.savedAt, savedBy: found.savedBy, body: found.body })
    },
    async restore(channelId, { versionId, baseVersion }) {
      await delay()
      const result = await db.update((data) => {
        const me = editor(data, channelId)
        const page = pageOf(data, channelId)
        const old = versionsOf(data, page).find((v) => v.id === versionId)
        if (!page || !old) throw notFound('Page version', versionId)
        checkTurn(data, page, me.id, baseVersion, true)
        const named = write(data, page, clone(old.body), me.id, true)
        return { view: viewOf(data, channelId), named }
      })
      published(channelId, result.view.version, result.view.updatedBy!, result.named)
      return clone(result.view)
    },
  }
}
