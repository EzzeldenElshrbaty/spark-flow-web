import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Api } from '@/api/types'
import { createDb } from './db'
import { createMockApi } from './index'
import { latency } from './latency'
import { createMockHub, type MockHub } from './realtime'
import { seed } from './seed'
import { createMemoryStore } from './store'

let hub: MockHub
let api: Api
let n = 0
beforeEach(() => {
  latency.min = latency.max = 0
  hub = createMockHub(`test-preview-${++n}`, null)
  api = createMockApi(createDb(createMemoryStore(), seed), hub)
})
afterEach(() => hub.close())

describe('chat.linkPreview (the server fetches allowed pages; the prototype knows a few)', () => {
  it('describes a known page', async () => {
    expect(await api.chat.linkPreview('https://staging.nexus.spark-sys.com')).toMatchObject({
      url: 'https://staging.nexus.spark-sys.com', siteName: 'Spark Systems', title: expect.any(String), description: expect.any(String), image: null,
    })
  })
  it('names an unknown page on an allowed domain after its address', async () => {
    expect(await api.chat.linkPreview('https://github.com/spark-sys/flow/pull/42')).toEqual({
      url: 'https://github.com/spark-sys/flow/pull/42', siteName: 'GitHub', title: 'spark-sys/flow/pull/42', description: null, image: null,
    })
  })
  it('gives nothing for a domain that is not allowed', async () => {
    expect(await api.chat.linkPreview('https://example.com/x')).toBeNull()
  })
})
