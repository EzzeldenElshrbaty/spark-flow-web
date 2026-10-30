import type { Api } from '@/api/types'
import type { MockDb } from './db'
import { delay } from './latency'
import { badRequest, clone, currentUser, newId, notFound } from './shared'

const NAME_MAX = 60

/** Workspace folders for files (spec 6.9 Add to folder): anyone in the workspace sees and makes them; names are unique. */
export function foldersApi(db: MockDb): Api['folders'] {
  return {
    async list(workspaceId) {
      await delay()
      const data = await db.read()
      if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
      return clone(data.folders.filter((f) => f.workspaceId === workspaceId).sort((a, b) => a.name.localeCompare(b.name)))
    },
    async create(workspaceId, name) {
      await delay()
      return clone(
        await db.update((data) => {
          const me = currentUser(data)
          if (!data.workspaces.some((w) => w.id === workspaceId)) throw notFound('Workspace', workspaceId)
          const clean = typeof name === 'string' ? name.trim() : ''
          if (!clean) throw badRequest('Name the folder.')
          if (clean.length > NAME_MAX) throw badRequest(`Keep the name under ${NAME_MAX} characters.`)
          const same = data.folders.find((f) => f.workspaceId === workspaceId && f.name.toLowerCase() === clean.toLowerCase())
          if (same) throw badRequest(`There’s a folder called ${same.name} already.`)
          const folder = { id: newId('fold'), workspaceId, name: clean, createdBy: me.id, createdAt: new Date().toISOString() }
          data.folders.push(folder)
          return folder
        }),
      )
    },
  }
}
