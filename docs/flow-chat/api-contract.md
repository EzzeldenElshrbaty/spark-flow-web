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

## Phase 1 · Feature 3: message list

`GET /api/channels/:id/messages?cursor=` pages newest first, 30 per page, ordered by `seq` (no longer by time). The client treats `nextCursor` as opaque; the mock uses the `seq` of the last message on the page and returns the messages with a smaller `seq`. `around=` (for jump to date and to a search hit) comes with those features in Phase 3.

On open the client may page back up to 10 pages to reach the person's first unread message, so `lastReadSeq` far back costs up to 10 requests.

### Jumping (date menu)

| Call | Route | Returns |
|---|---|---|
| Where a jump lands | `GET /api/channels/:id/messages/first?since=<ISO>` (no `since`: the very beginning) | The `seq` of the first message at or after `since`, or `null` when there is none. |
| Newer messages | `GET /api/channels/:id/messages?after=<seq>` | Up to 30 messages with a larger `seq`, newest first. `nextCursor` is the newest `seq` on the page while more newer ones exist, else `null`. |

The date menu offers Today, Yesterday, Last week, Last month (each from local midnight) and The very beginning. "Jump to a specific date…" comes in Phase 3.

## Phase 1 · Feature 4: message rendering

### Message body

Every message and thread reply carries `body`: the text as structured rich text (spec §7). `content` stays the text as written (search, editing). The shapes are in `src/lib/messageBody.ts`:

- Blocks: `p` (inlines), `quote` (blocks), `ul` / `ol` (items of inlines), `code` (text).
- Inlines: `text` with optional `marks` (`b`, `i`, `u`, `s`, `code`), `link` (`href`, `text`; http and https only), `user` (`id`, `name` when written), `all`, `channel` (`id`, `name`), `task` (`key`), `project` (`key`).

Until the rich composer lands (feature 5), the server works `body` out from `content` on send, reply and edit, with the same rules as `parseBody` in that file (the composer's markdown: `*bold*`, `_italic_`, `~strike~`, `` `code` ``, ```` ``` ```` blocks, `> ` quotes, `- ` and `1. ` lists; mentions `@[Name](id)`, `@all`, `@KEY`, `@KEY-1`; channels `#[name](id)`; bare task keys matching `[A-Z][A-Z0-9]+-\d+`). A deleted message has `body: []`.

### System messages

`system` is set on what the channel itself says, sent by whoever made the change: `{ kind: 'joined' }`, `{ kind: 'left' }`, `{ kind: 'renamed', from, to }`, `{ kind: 'topic', to }`. They arrive as `message.created`, never count as unread, and can't be edited or deleted.

### Task references

| Call | Route | Returns |
|---|---|---|
| Resolve keys | `GET /api/tasks/resolve?keys=NEX-103,NEX-104` | `TaskRef[]` for the keys that are tasks the person may see: `key, title, status, statusLabel, category, projectKey, projectName, assigneeId`. |

The client refreshes resolved tasks on `ticketUpdated`, so chip status is live.

### Thread summary

Messages read from the API carry `replyUserIds`: who replied last, newest first, each once, at most 5 (spec §7 `reply_user_ids`). It is worked out on read (or kept with `threadCount` and `lastReplyAt` in the same transaction as each reply) and should come with `thread.updated`.

### Link previews

| Call | Route | Returns |
|---|---|---|
| Preview a link | `GET /api/link-preview?url=<url>` | `LinkPreview` (`url, siteName, title, description, image`) or `null`. |

- Only for domains on the allow-list (`PREVIEW_DOMAINS` in `src/lib/linkPreview.ts`: spark-sys.com, github.com, figma.com, docs.google.com, and their subdomains); anything else returns `null` without a request.
- **The server fetches the page, never the browser.** Guard the fetch: http and https only, resolve the host and refuse private, loopback and link-local addresses (SSRF), follow at most 3 redirects and re-check each one against the allow-list, 3s timeout, read at most 1 MB, and send no cookies or credentials.
- Take `og:title` / `<title>`, `og:description`, `og:site_name` and `og:image`. Return `image` only as an https address (better: proxied through the API). Cache results for an hour.
- The client shows one preview per message: the first allowed link.

### Reactions

`POST /api/messages/:id/reactions` (and the reply equivalent) toggles the person's reaction with any single emoji (one grapheme, e.g. 👍🏽 or 🇪🇬); anything else is `400` "Pick an emoji.". A message holds at most 50 different emoji: a new one past that is `400` "This message has 50 different reactions already." The client toggles optimistically and rolls back on an error, so the rule must match `toggleReaction` in `src/lib/reactions.ts`.

### Permalinks

`/w/:ws/c/:channelId?message=:messageId` opens the channel on that message (Copy link to file gives it); a reply's link is `?thread=:messageId`. The client looks the message up with `GET /api/messages/:id`.

## Phase 1 · Feature 5: composer

### Sending a body

`POST /api/channels/:id/messages` takes `{ content, clientId?, body? }`. From the rich composer `body` is set (the structured message) and `content` is its plain text. The server must:

- Check `body` node by node exactly like `validBody` in `src/lib/messageBody.ts` (known blocks, inlines and marks only; links http/https only; ids `[\w-]{1,100}`; quotes don't nest; unknown fields dropped) and answer `400` "That message couldn't be read." otherwise.
- Store `content` as the body's plain text (`bodyText`), and take mentions and task keys from the body (`mentionsOf`, `bodyTaskKeys`), not from `content`.
- Allow up to **40,000** characters of plain text (`400` "Keep the message under 40000 characters.").

Without `body` the server parses `content` as before.

### Drafts

| Call | Route | Body | Returns |
|---|---|---|---|
| My drafts | `GET /api/workspaces/:id/drafts` | | `Draft[]` (`channelId, rootId, body, updatedAt`) for channels I can read |
| Save a draft | `PUT /api/channels/:id/draft` | `{ body, rootId }` | the `Draft`, or `null` when the body is empty (the draft is deleted) |

One draft per (user, channel, thread root). The composer saves 500ms after typing stops and deletes the draft when the message is sent. Each save sends `draft.updated` `{ userId, channelId }` to that user's own connections (client handler `onDraftChanged`).
