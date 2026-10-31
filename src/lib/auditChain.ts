import type { AuditChainState, AuditEvent } from '@/api/types'
import { sha256 } from '@/lib/sha256'

// The audit log's chain of events (Admin and help, slice 2). Each entry's hash covers its fields in a fixed order and
// the hash of the entry before it, so changing, removing or reordering any entry breaks the chain from there on.
// Honest limit: whoever can rewrite the whole log can rebuild the chain. The backend keeps the log append-only and
// anchors the latest hash where the app server can't change it.

/** The `prevHash` of the very first entry. */
export const GENESIS = '0'.repeat(64)

export type UnchainedEvent = Omit<AuditEvent, 'prevHash' | 'hash'>

/** The fields a hash covers, in this order; a backend must hash the same text. */
const FIELDS = ['seq', 'at', 'actorId', 'actorName', 'actorRoles', 'action', 'group', 'record', 'changes', 'result', 'detail', 'ip', 'device', 'requestId', 'prevHash'] as const

/** The entry as the text its hash is taken over: an array of its fields in FIELDS order, records and changes too. */
export function canonical(event: UnchainedEvent & { prevHash: string }): string {
  return JSON.stringify(
    FIELDS.map((field) => {
      const value = event[field]
      if (field === 'record') return event.record && [event.record.type, event.record.id, event.record.name]
      if (field === 'changes') return event.changes.map((c) => [c.field, c.from, c.to])
      return value ?? null
    }),
  )
}

/** The entry as stored: chained to the one before it. */
export function chainEvent(event: UnchainedEvent, prevHash: string): AuditEvent {
  return { ...event, prevHash, hash: sha256(canonical({ ...event, prevHash })) }
}

export type ChainState = AuditChainState

/** Walks the log oldest first and names the first entry that doesn't fit: changed, after a gap, or out of order. */
export function verifyChain(events: readonly AuditEvent[]): ChainState {
  let prev = GENESIS
  let prevSeq = 0
  for (const event of events) {
    const broken = (reason: 'edited' | 'removed' | 'reordered'): ChainState => ({ intact: false, checked: events.length, brokenAt: event.seq, reason })
    if (event.seq <= prevSeq) return broken('reordered')
    // A gap: the missing entry further down means out of order; nowhere means removed.
    if (event.seq !== prevSeq + 1) return broken(events.some((e) => e.seq === prevSeq + 1) ? 'reordered' : 'removed')
    if (event.prevHash !== prev || sha256(canonical(event)) !== event.hash) return broken('edited')
    prev = event.hash
    prevSeq = event.seq
  }
  return { intact: true, checked: events.length }
}
