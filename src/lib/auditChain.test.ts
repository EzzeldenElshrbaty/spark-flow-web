import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AuditEvent } from '@/api/types'
import { chainEvent, GENESIS, verifyChain, type UnchainedEvent } from './auditChain'
import { sha256 } from './sha256'

describe('sha256', () => {
  it('matches the standard test vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
    expect(sha256('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
  })

  it('matches Node’s for text of every length around the block size, Arabic and emoji included', () => {
    for (let n = 0; n < 140; n++) {
      const text = 'ب👍x'.repeat(n).slice(0, n)
      expect(sha256(text), String(n)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
    }
  })
})

const event = (seq: number, over: Partial<UnchainedEvent> = {}): UnchainedEvent => ({
  seq, at: `2026-10-31T10:0${seq}:00.000Z`, actorId: 'u-1', actorName: 'Youssef Abdelrahman', actorRoles: 'Admin', action: 'changed', group: 'data',
  record: { type: 'project', id: 'p-nex', name: 'Nexus Core' }, changes: [{ field: 'Due date', from: '1 Nov 2026', to: '8 Nov 2026' }], result: 'done',
  detail: null, ip: '156.199.4.21', device: 'Chrome 130 · macOS', requestId: `req-${seq}`, ...over,
})

/** Three events chained as the server stores them. */
function chain(): AuditEvent[] {
  const out: AuditEvent[] = []
  for (const seq of [1, 2, 3]) out.push(chainEvent(event(seq), out.at(-1)?.hash ?? GENESIS))
  return out
}

describe('the audit chain (Admin and help, slice 2)', () => {
  it('each event holds the hash of the one before it, and its own over that and every field', () => {
    const [a, b, c] = chain()
    expect(a.prevHash).toBe(GENESIS)
    expect(b.prevHash).toBe(a.hash)
    expect(c.prevHash).toBe(b.hash)
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
    // The same event chains to the same hash: the form is fixed, whatever order the fields were written in.
    const reordered = Object.fromEntries(Object.entries(event(1)).reverse()) as UnchainedEvent
    expect(chainEvent(reordered, GENESIS).hash).toBe(a.hash)
  })

  it('an intact chain checks out', () => {
    expect(verifyChain(chain())).toEqual({ intact: true, checked: 3 })
    expect(verifyChain([])).toEqual({ intact: true, checked: 0 })
  })

  it('names the first event that was changed, even by one field', () => {
    const events = chain()
    events[1] = { ...events[1], changes: [{ field: 'Due date', from: '1 Nov 2026', to: '9 Nov 2026' }] }
    expect(verifyChain(events)).toEqual({ intact: false, checked: 3, brokenAt: 2, reason: 'edited' })
    const actor = chain()
    actor[2] = { ...actor[2], actorName: 'Someone else' }
    expect(verifyChain(actor)).toMatchObject({ intact: false, brokenAt: 3, reason: 'edited' })
  })

  it('names a removed event by the one after the gap, and events out of order', () => {
    const [a, , c] = chain()
    expect(verifyChain([a, c])).toEqual({ intact: false, checked: 2, brokenAt: 3, reason: 'removed' })
    const [x, y, z] = chain()
    expect(verifyChain([x, z, y])).toMatchObject({ intact: false, brokenAt: 3, reason: 'reordered' })
  })

  it('a rewritten event with a fresh hash still breaks the link to the next one', () => {
    const events = chain()
    events[1] = chainEvent({ ...event(2), detail: 'quietly changed' }, events[0].hash)
    expect(verifyChain(events)).toMatchObject({ intact: false, brokenAt: 3, reason: 'edited' })
  })
})
