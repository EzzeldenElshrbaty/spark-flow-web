import { describe, expect, it } from 'vitest'
import { createQueryClient } from '@/lib/queryClient'

describe('createQueryClient', () => {
  it('a change reloads everything on screen', async () => {
    const client = createQueryClient()
    client.setQueryData(['a'], 1)
    await client.getMutationCache().build(client, { mutationFn: async () => 'ok' }).execute(undefined)
    expect(client.getQueryState(['a'])?.isInvalidated).toBe(true)
  })

  // A page autosaves about once a second (chat spec 6.14): it writes its own answer instead of reloading everything.
  it('a mutation with meta.invalidate false invalidates nothing', async () => {
    const client = createQueryClient()
    client.setQueryData(['a'], 1)
    await client.getMutationCache().build(client, { mutationFn: async () => 'ok', meta: { invalidate: false } }).execute(undefined)
    expect(client.getQueryState(['a'])?.isInvalidated).toBe(false)
  })
})
