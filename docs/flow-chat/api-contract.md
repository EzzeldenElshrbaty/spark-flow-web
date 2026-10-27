# Flow chat: API contract for the .NET backend

What the web client sends and expects, slice by slice, as the Flow chat redesign lands. The TypeScript source of truth is `src/api/types.ts` (shapes) and `src/lib/http.ts` (routes); the mock backend in `src/mocks/chat.ts` shows the rules. Spec references are to `FLOW_CHAT_REDESIGN.md`.

JSON is camelCase. Times are ISO 8601 UTC strings. Errors are RFC 7807 problem details (`title`, `status`, `detail`); the client shows `detail` as a sentence.

## Phase 1 · Feature 1: message order and read state

### Message

New fields on every message:

| Field | Type | Rule |
|---|---|---|
| `seq` | integer | 1, 2, 3… per channel, in the order the server stores messages. Never reused, never renumbered. Thread replies don't take a seq. |
| `clientId` | string, optional | The id the sender's client made up (a UUID). Echoed back on the stored message. |

### Channel (as the signed-in person sees it)

| Field | Type | Rule |
|---|---|---|
| `lastSeq` | integer | The seq of the newest message; 0 when empty. |
| `lastReadSeq` | integer | My read marker. 0 for a channel I have never opened. |
| `starred` | boolean | Mine only. |
| `muted` | boolean | Mine only. |
| `notifyLevel` | `"all" \| "mentions" \| "none"` | Mine only. No endpoint changes it yet (the bell's settings come later); send `"all"`. |
| `unreadCount` | integer | Messages with `seq > lastReadSeq`, sent by someone else, not deleted. |

These map to the spec's `ChannelMember` row (`last_read_seq`, `starred`, `muted`, `notify_level`). A person with no row reads as the defaults above.

### Routes

| Call | Route | Body | Returns |
|---|---|---|---|
| Send | `POST /api/channels/:id/messages` | `{ content, clientId? }` | The stored message, `201`. |
| Mark read | `POST /api/channels/:id/read` | `{ seq? }` | `204`. |
| Star / mute | `PATCH /api/channels/:id/me` | `{ starred }` or `{ muted }` | The channel as I see it. |

Rules:

- **Send is idempotent by `clientId`.** If the same sender already stored a message with this `clientId` in this channel, return that message (`200` or `201`) and publish nothing. A different sender with the same `clientId` is a different message.
- **Mark read only moves forward.** The new marker is `max(current, min(seq, lastSeq))`. Without `seq`, read to `lastSeq`. The client sends the seq of the newest message on screen, so one that arrives meanwhile stays unread.
- **Star and mute** need read access to the channel (`403` "You're not in this channel." for someone else's private channel, `404` for an unknown one).

### Real-time events

The client's handler names stay as they are; the wire names are the spec's (§8).

| Client handler | Wire event | Payload |
|---|---|---|
| `onMessageReceived` | `message.created` | The message, with `seq`. Clients order by `seq` and refetch when they see a gap. |
| `onMessageChanged` | `message.updated`, `message.deleted` | `{ channelId, messageId }` |
| `onReadChanged` | `read.marker_updated` | `{ userId, channelId?, seq? }`, sent only to `userId`'s own connections. `seq` is set for a new read marker; star and mute changes send `channelId` without `seq`. Mention reads send `userId` alone. |

On reconnect the client expects missed `message.created` events replayed in `seq` order per channel (spec §8, transport rules).

## Phase 1 · Feature 2: channel header and tabs

No new routes. The header uses the ones above: the star toggle and Mute in the more menu call `PATCH /api/channels/:id/me`, and Mark all read calls `POST /api/channels/:id/read` with no `seq`. Edit details, Leave and Archive use the existing channel routes. The tabs are client-side (`?tab=files|pins|page`); Files, Pins and Page get their own endpoints when they are built (Phases 3 and 4).
