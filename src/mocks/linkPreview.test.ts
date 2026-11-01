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

describe('chat.linkPreview (the server reads any page; the prototype knows a few)', () => {
  it('describes a known page, with its image and the image size', async () => {
    expect(await api.chat.linkPreview('https://elevenlabs.io/')).toEqual({
      url: 'https://elevenlabs.io/',
      title: 'Free AI Voice Generator & Voice Agents Platform | ElevenLabs',
      description: expect.any(String),
      image: { url: expect.stringMatching(/link-previews\/elevenlabs\.svg$/), width: 1200, height: 630 },
    })
  })
  it('matches a known page with or without the trailing slash or www', async () => {
    expect((await api.chat.linkPreview('https://www.elevenlabs.io'))?.title).toMatch(/ElevenLabs/)
    expect((await api.chat.linkPreview('https://staging.nexus.spark-sys.com/'))?.title).toBe('Nexus Core · Staging')
  })
  it('names any other page after its address, never with a made-up title', async () => {
    expect(await api.chat.linkPreview('https://example.com/pricing/')).toEqual({
      url: 'https://example.com/pricing/', title: 'example.com/pricing', description: null, image: null,
    })
    expect((await api.chat.linkPreview('https://www.example.com'))?.title).toBe('example.com')
  })
  it('gives nothing for what is not a web address', async () => {
    expect(await api.chat.linkPreview('ftp://example.com/x')).toBeNull()
  })
})

describe('a dismissed preview is kept on the message (spec 6.3)', () => {
  it('send and edit store the link’s noPreview mark', async () => {
    const channels = await api.chat.channels((await api.workspaces.list())[0].id)
    const channel = channels.find((c) => c.kind === 'channel' && c.memberIds.length > 0)!
    const body = [{ type: 'p' as const, children: [{ type: 'link' as const, href: 'https://elevenlabs.io/', text: 'https://elevenlabs.io/', noPreview: true as const }] }]
    const sent = await api.chat.send(channel.id, 'https://elevenlabs.io/', undefined, body)
    expect(sent.body).toEqual(body)
    const edited = await api.chat.edit({ kind: 'message', id: sent.id }, 'x', [...body, { type: 'p', children: [{ type: 'text', text: 'more' }] }])
    expect(edited.body[0]).toEqual(body[0])
  })
})
