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
| `notifyLevel` | `"all" \| "mentions" \| "none"` | Mine only, the level that applies. Without a level of my own: my Preferences default for a channel (`"mentions"` until I change it), `"all"` for a DM. Set with `PATCH /api/channels/:id/me` `{ notifyLevel }` (Phase 2 slice 3). |
| `notifyLevelOwn` | boolean | Whether I picked `notifyLevel` here; otherwise it is my Preferences default (`"all"` for a DM) (slice Z). |
| `unreadCount` | integer | Messages with `seq > lastReadSeq`, sent by someone else, not deleted. |

These map to the spec's `ChannelMember` row (`last_read_seq`, `starred`, `muted`, `notify_level`). A person with no row reads as the defaults above.

### Routes

| Call | Route | Body | Returns |
|---|---|---|---|
| Send | `POST /api/channels/:id/messages` | `{ content, clientId? }` | The stored message, `201`. |
| Mark read | `POST /api/channels/:id/read` | `{ seq? }` | `204`. |
| Mark unread | `POST /api/channels/:id/unread` | `{ seq }` | `204`. |
| Star / mute | `PATCH /api/channels/:id/me` | `{ starred }` or `{ muted }` | The channel as I see it. |

Rules:

- **Send is idempotent by `clientId`.** If the same sender already stored a message with this `clientId` in this channel, return that message (`200` or `201`) and publish nothing. A different sender with the same `clientId` is a different message.
- **Mark read only moves forward.** The new marker is `max(current, min(seq, lastSeq))`. Without `seq`, read to `lastSeq`. The client sends the seq of the newest message on screen, so one that arrives meanwhile stays unread.
- **Opening a channel marks it read** (spec 6.2): once per visit, the client sends `POST /api/channels/:id/read` with the channel's `lastSeq` as it was when the channel opened, unless the channel has nothing unread or is held by Mark unread. The New line comes from the marker before that call. The unread bar's Mark as unread calls Mark unread with the first new message's `seq`.
- **Mark unread is the one way back.** It sets the marker to `seq - 1`, back or forward, so that message and everything after it count as unread again, and what came before it as read. `seq` must be a whole number from 1 to `lastSeq`, else `400` "That message isn't in this channel."; read access as for star and mute. It publishes `read.marker_updated` with the new `seq`, like Mark read.
- **Star and mute** need read access to the channel (`403` "You're not in this channel." for someone else's private channel, `404` for an unknown one).

### Real-time events

The client's handler names stay as they are; the wire names are the spec's (§8).

| Client handler | Wire event | Payload |
|---|---|---|
| `onMessageReceived` | `message.created` | The message, with `seq`. Clients order by `seq` and refetch when they see a gap. |
| `onMessageChanged` | `message.updated`, `message.deleted` | `{ channelId, messageId }` |
| `onReadChanged` | `read.marker_updated` | `{ userId, channelId?, seq? }`, sent only to `userId`'s own connections. `seq` is set for a new read marker; star and mute changes send `channelId` without `seq`. Mention reads send `userId` alone. |
| `onPageSaved` | `page.saved` | `{ channelId, version, userId }`, to everyone who can read the channel (Phase 4 · Slice PG) |
| `onPageEditing` | `page.editing` | `{ channelId, userId, until }`; `userId` and `until` are null when the page is let go (Phase 4 · Slice PG) |

On reconnect the client expects missed `message.created` events replayed in `seq` order per channel (spec §8, transport rules).

## Phase 1 · Feature 2: channel header and tabs

No new routes. The header uses the ones above: the star toggle and Mute (under the bell since slice 3) call `PATCH /api/channels/:id/me`, and Mark all read calls `POST /api/channels/:id/read` with no `seq`. Leave and Archive use the existing channel routes (archive and restore: Admins who may manage the channel, spec 6.1; anyone else `403` "Only admins can archive channels."); message edit is the author's alone and delete the author's or an Admin's (`can()` `message.edit` / `message.delete`; `403` "You can only change your own messages."); Channel details (slice 4, below) has its own. The tabs are client-side (`?tab=files|pins|page`); Files, Pins and Page get their own endpoints when they are built (Phases 3 and 4).

## Phase 1 · Feature 3: message list

`GET /api/channels/:id/messages?cursor=` pages newest first, 30 per page, ordered by `seq` (no longer by time). The client treats `nextCursor` as opaque; the mock uses the `seq` of the last message on the page and returns the messages with a smaller `seq`. `around=` (for jump to date and to a search hit) comes with those features in Phase 3.

On open the client may page back up to 10 pages to reach the person's first unread message, so `lastReadSeq` far back costs up to 10 requests.

### Jumping (date menu)

| Call | Route | Returns |
|---|---|---|
| Where a jump lands | `GET /api/channels/:id/messages/first?since=<ISO>` (no `since`: the very beginning) | The `seq` of the first message at or after `since`, or `null` when there is none. |
| Newer messages | `GET /api/channels/:id/messages?after=<seq>` | Up to 30 messages with a larger `seq`, newest first. `nextCursor` is the newest `seq` on the page while more newer ones exist, else `null`. |
| Older messages | `GET /api/channels/:id/messages?before=<seq>` | Up to 30 messages with a smaller `seq`, newest first: the first page back from a jump. `nextCursor` is the usual opaque cursor, which goes on with `?cursor=`. The client never builds a `cursor` itself. |

The date menu offers Today, Yesterday, Last week, Last month (each from local midnight) and The very beginning. "Jump to a specific date…" comes in Phase 3.

## Phase 1 · Feature 4: message rendering

### Message body

Every message and thread reply carries `body`: the text as structured rich text (spec §7). `content` stays the text as written (search, editing). The shapes are in `src/lib/messageBody.ts`:

- Blocks: `p` (inlines), `quote` (blocks), `ul` / `ol` (items of inlines), `code` (text).
- Inlines: `text` with optional `marks` (`b`, `i`, `u`, `s`, `code`), `link` (`href`, `text`; http and https only; optional `marks` as text has, which only a task description's links carry, a bold address say), `user` (`id`, `name` when written), `all`, `channel` (`id`, `name`), `task` (`key`), `project` (`key`).

Until the rich composer lands (feature 5), the server works `body` out from `content` on send, reply and edit, with the same rules as `parseBody` in that file (the composer's markdown: `*bold*`, `_italic_`, `~strike~`, `` `code` ``, ```` ``` ```` blocks, `> ` quotes, `- ` and `1. ` lists; mentions `@[Name](id)`, `@channel` (stored as `{ type: 'all' }`; `@all`, its first spelling, reads the same), `@here` (`{ type: 'here' }`, mention kind `here`), `@KEY`, `@KEY-1`; channels `#[name](id)`; bare task keys matching `[A-Z][A-Z0-9]+-\d+`). A deleted message has `body: []`.

### System messages

`system` is set on what the channel itself says, sent by whoever made the change: `{ kind: 'joined' }`, `{ kind: 'left' }`, `{ kind: 'renamed', from, to }`, `{ kind: 'topic', to }`. They arrive as `message.created`, never count as unread, and can't be edited or deleted.

### Task references

| Call | Route | Returns |
|---|---|---|
| Resolve keys | `GET /api/tasks/resolve?keys=NEX-103,NEX-104` | `TaskRef[]` for the keys that are tasks the person may see: `key, title, status, statusLabel, category, projectKey, projectName, assigneeId`. The server filters by the caller's access to each task's project and leaves out any key it can't show; it never says why a key is missing. |

The client refreshes resolved tasks on `ticketUpdated`, so chip status is live. It also keeps a chip only when the task's project is one the viewer can see in the open workspace (`useBodyContext`); anything else stays plain text. The mock has no private projects (everyone in a workspace sees all its projects), so its `resolve` returns every task that exists: the per-project check is the backend's.

### Thread summary

Messages read from the API carry `replyUserIds`: who replied last, newest first, each once, at most 5 (spec §7 `reply_user_ids`). It is worked out on read (or kept with `threadCount` and `lastReplyAt` in the same transaction as each reply) and should come with `thread.updated`.

### Sidebar order (spec 5.1 drag to reorder)

| Call | Route | Returns |
|---|---|---|
| My order | `GET /api/workspaces/:id/sidebar-order` | `SidebarOrder`: `{ starred: string[], channels: string[], projects: string[] }`. An empty list means I have no order of my own there. |
| Save a section's order | `PUT /api/workspaces/:id/sidebar-order` `{ section: 'starred' \| 'channels' \| 'projects', ids }` | `204` |

- **Scope:** each person has one order per workspace and section. It follows them to their other devices and tabs through `sidebarChanged { userId }`, which is sent only to that person.
- **What is kept:** only ids that may be listed in that section, each once, at most 500 (more is `400`).
  - Starred and Channels hold channels and DMs in that workspace that I may list: public channels, and private ones and DMs I'm in.
  - Projects holds that workspace's projects. An archived project stays in the list, so it comes back to its place when restored.
  - An empty list deletes the order (the client's Sort A–Z, or Reset order for Projects).
  - An unknown section is `400`; an unknown workspace is `404`.
- **Kept current by the server:** starring, unstarring or leaving a channel removes its id from my Starred and Channels lists in the same write, and sends `sidebarChanged`. The row then comes back at the end of its section.
- **Applied by the client** (`lib/sidebarOrder.ts`):
  - Saved ids come first, in order.
  - Rows the order doesn't know follow in the default order: A–Z for channels, creation order for projects.
  - Muted channels sink to the end (spec 6.11), keeping that order. A drag can't cross the line between muted and unmuted rows.

### Search (spec 6.12, §8, §9)

| Call | Route | Returns |
|---|---|---|
| Search | `GET /api/workspaces/:id/search?q=&type=&sort=&from=&from=&in=&has=&is=thread&after=&before=&cursor=` | `SearchResults`: `{ counts, items: SearchHit[], nextCursor }` |

- **What the client sends:** `q` is the words and "quoted phrases" only. The client reads the operators (`from:@nour`, `in:#backend` or `in:@nour`, `has:`, `is:thread`, `after:`, `before:`) with `lib/searchQuery.ts` and sends them as parameters:
  - `from`: people ids, repeatable, anyone of them.
  - `in`: one channel or DM id.
  - `has`: `file`, `link`, `pin` or `reaction`.
  - `is=thread`: a thread's parent or a reply.
  - `after` and `before`: the viewer's local days, `YYYY-MM-DD`. `after` includes its day; `before` doesn't.
  - `type`: one of `messages`, `files`, `tasks`, `channels`, `people`.
  - `sort`: `relevant` or `newest`.
- **Access (§9):**
  - Messages and replies come from the workspace's public channels (joined or not, archived included), and from private channels and DMs only for their members.
  - Deleted messages, system lines and task cards are never results.
  - A reply also sent to the channel is found once, as the reply.
  - Files come from the same places, each once.
  - Tasks come from projects in the workspace that aren't archived. Channels are the ones the person may see. People are the workspace's members.
- **Matching:**
  - Every word must start a word, and a phrase must appear as written. Case and accents are ignored, Arabic marks included. The client highlights with the same rule.
  - Messages and files take every filter. A filter-only query (e.g. `from:@nour`) lists that person's messages and files.
  - Tasks (key, title), channels (name, topic) and people (name, title) go by the words only and need some.
- **Order and paging:**
  - Most relevant ranks by more matches, with a phrase match counting 3, then newest first. Newest is by time.
  - Messages come 20 a page with an opaque `cursor`; the other tabs return up to 50.
  - `counts` holds every tab's total for the same search.
- **Backend:** a full-text index over `body_text` (§7) with the access filter applied in the query, not after it, so counts never leak private messages. One index per workspace is fine.

### Threads (spec 6.12)

| Call | Route | Returns |
|---|---|---|
| Threads I follow | `GET /api/workspaces/:id/threads?cursor=` | `ThreadsPage`: `{ items: ThreadCard[], nextCursor, unreadThreads }` |
| Read threads | `POST /api/workspaces/:id/threads/read` `{ rootIds }` | `204` |

- **Which threads:** a thread is a message with at least one reply that isn't deleted, in a channel or DM of this workspace that I'm a member of, and that I follow (spec 6.7: my own choice, else I wrote it, replied, or was named). A deleted parent still shows while it has replies; its row reads as deleted.
- **Order and paging:** threads with unread replies first, then the rest, each newest reply first. 20 a page; `cursor` is opaque. `unreadThreads` counts every followed thread with unread replies in the workspace, on every page; it is the sidebar's count.
- **`ThreadCard`:**
  - `root`: the message, as the channel lists it, with `following`.
  - `channelId`.
  - `replies`: the replies shown, oldest first. These are the unread ones, at least 2 and at most 10, otherwise the latest 2. Deleted replies are left out.
  - `totalReplies`: replies that aren't deleted.
  - `unreadCount`: replies by others that I haven't read.
  - `participantIds`: the newest repliers then the parent's author, at most 5.
  - `lastReplyAt`.
- **What unread means:** it is Activity's read state. A reply is unread while its `thread` Activity item is unread, or while a mention of me in it is unread (the bell). There is no separate thread marker. `/threads/read` marks both for every reply in those threads, skips roots I can't read or don't follow (no error), and sends `readChanged` to me. Activity's Mark all read clears Threads too.
- **Live:** `replyReceived`, `messageChanged` (edits, deletes, follow changes), `channelChanged` (leaving) and `readChanged` refresh the list.

### Preferences (spec 6.11, §7 NotificationPref)

| Call | Route | Returns |
|---|---|---|
| Mine | `GET /api/me/preferences` | `Preferences` |
| Change some | `PATCH /api/me/preferences` with any of the fields | `Preferences` as stored |

- **One record per person**, across every workspace. Without one, the defaults: `defaultLevel: "mentions"`, `keywords: []`, `desktop: false`, `push: true`, `emailDigest: "daily"`, `dndUntil: null`, `dndSchedule: { on: false, from: "18:00", to: "09:00", days: [0,1,2,3,4], tz: "Africa/Cairo" }` (Sunday to Thursday is Spark's week; the backend may start `tz` from the person's own zone), `singleKeyShortcuts: true` (UX Phase 5A: `/` for search and G then P / G then C; off turns those off, never the ⌘/Ctrl ones). A stored record from before the field reads it as `true` (the mock's v32 migration).
- **Fields and their checks** (`400` with the sentence in `src/mocks/preferences.ts`):
  - `defaultLevel`: `"all" | "mentions" | "none"`.
  - `keywords`: up to 20, each trimmed and at most 40 characters; empty ones are dropped and duplicates (ignoring case) kept once.
  - `desktop`, `push`, `singleKeyShortcuts`: booleans. `emailDigest`: `"off" | "hourly" | "daily"`.
  - `dndUntil`: an ISO time with a time part, or `null` (Resume).
  - `dndSchedule`: `from` and `to` as `HH:MM` and not the same time, `days` 0 (Sunday) to 6, at least one day while `on`, and `tz` a real IANA zone.
- It sends `preferencesChanged { userId }` to that person's connections only; channel lists and open channels, the bell, Activity and Threads reload with it.
- **The level a channel reports** (the Channel fields above): my own level for it when I picked one, else my `defaultLevel` for a channel and `"all"` for a DM. `notifyLevelOwn: boolean` says which. A stored level that equals the old default (`"mentions"` for a channel, `"all"` for a DM) was never really chosen: read it as not set (the mock's v23 migration does that).
- **Keywords count like mentions.** In a channel I'm a member of whose level isn't Nothing and that isn't muted, someone else's message or reply whose text holds one of my keywords (matched like Search: a word start, case and accents ignored) is a mention for the bell, Activity and the sidebar's count. Its `MentionItem` and Activity item carry `keyword` (the keyword as I wrote it), else `null`.
  - Only someone's own words: not system lines, task or comment cards, nor a reply's copy in the channel (`keywordable` in `src/lib/notifyRules.ts`).
  - **From when it was added:** the server keeps when each keyword (lowercased) was added and matches it only in messages and replies created since, so adding a word never brings old messages back as unread mentions. Writing a kept keyword another way keeps its time; removing it and adding it again starts over.
- **Delivery outside the app** follows `notifies` in `src/lib/notifyRules.ts`, the same rule for desktop (client), push and email (server), each behind its own switch (`desktop`, `push`, `emailDigest`):
  - Never my own messages or what the channel itself says, never a muted channel or one at Nothing, never while Do Not Disturb is on.
  - At All (and in a DM by default), every message; at Mentions and keywords, a mention of me (`@channel`, `@here` as recorded, by name) or one of my keywords.
  - **Do Not Disturb** is on while `now < dndUntil`, or inside the schedule read in its own `tz`. A schedule that runs past midnight (18:00 to 09:00) belongs to the day it starts. It holds back desktop, push and email only; badges and counts don't change.
  - Push goes out when `push` is on; the email digest of unread mentions (Off, Hourly, Daily) when Do Not Disturb isn't on at send time. The prototype sends neither.
  - The client shows a desktop notification only while no Flow tab in that browser is in front (tabs tell each other over a `BroadcastChannel`, `src/lib/flowInFront.ts`) and the browser allows it, tagged with the message or reply id so another tab's replaces it.

### Link previews

| Call | Route | Returns |
|---|---|---|
| Preview a link | `GET /api/link-preview?url=<url>` | `LinkPreview` (`url, title, description, image`) or `null`. |
| A preview's image | `GET /api/link-preview/image?u=<id>` | The image bytes the server fetched, with its own `Content-Type` (an image type only). |

- Any http or https link (slice L, 31 Oct 2026; the earlier allow-list is gone). `null` only for an address that isn't a web address, or a page the server could not reach.
- **The server fetches the page, never the browser.** Guard every fetch (the page and its image): http and https only, ports 80 and 443 only; resolve the host, refuse private, loopback, link-local, unique-local and other non-public addresses (IPv4-mapped IPv6 too), and **connect to the address you just checked** (pin it, don't resolve again), so DNS rebinding can't reach the internal network; do all of that again for each redirect (at most 3); 5 s timeout; read at most 1 MB of HTML (and 5 MB of image); send no cookies or credentials; a plain `User-Agent` naming Spark Flow.
- The image route serves only PNG, JPEG, WebP and GIF, checked by their first bytes (re-encode, or refuse anything else; never SVG, which runs script on our origin), with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` and `Content-Disposition: inline`. The client loads preview images only from the app's or the API's origin (`ownImage` in `src/lib/linkPreview.ts`).
- Read, in order: `og:title` / `twitter:title` / `<title>`; `og:description` / `twitter:description` / `<meta name="description">`; `og:image` / `twitter:image`. The address must have a host with a dot (`previewable`); the client doesn't ask for a half-typed one. Without a title, the title is the address as host and path, without `www.` or a trailing `/` ("example.com/pricing"); never a made-up one.
- `image` is `{ url, width, height }` or `null`. `url` is the API's image route above (the client never loads the site's own image address); `width` and `height` are the real image's size, which the server learns while fetching it, so the card can lay out before it loads. Drop images that aren't images, are over 5 MB or under 64 px.
- Cache each result for 24 hours by address.
- One preview per message: its first http or https link outside code. The author can remove it (× on the card in the box): the message stores that link with `"noPreview": true` in its `body` (a field of the `link` inline, kept by the body check like the others, and kept on edit when the client sends it again). The client then shows no card for that message.

### Reactions

`PUT /api/messages/:id/reactions/:emoji` puts the person's reaction on and `DELETE` on the same path takes it off (and the reply equivalents under `/api/replies/:id`); `:emoji` is URL-encoded. Both are sets (spec §8): asking again changes nothing, answers `204` and sends no event, so a retry after a lost response is safe. The emoji is any single emoji (one grapheme, e.g. 👍🏽 or 🇪🇬) of at most 16 code points, made only of pictographs, flag letters, skin tones, U+FE0F, U+200D and the tag letters U+E0020–E007F (`isOneEmoji` in `src/lib/emojiText.ts`); anything else, such as an emoji stretched with combining marks, is `400` "Pick an emoji.". A message holds at most 50 different emoji: a new one past that is `400` "This message has 50 different reactions already." Taking one off is never refused for that limit. The client sets it optimistically and rolls back on an error, so the rule must match `setReaction` in `src/lib/reactions.ts`.

### Permalinks

`/w/:ws/c/:channelId?message=:messageId` opens the channel on that message (Copy link to file gives it); a reply's link is `?thread=:messageId`. The client looks the message up with `GET /api/messages/:id`.

## Phase 1 · Feature 5: composer

### Sending a body

`POST /api/channels/:id/messages` takes `{ content, clientId?, body? }`. From the rich composer `body` is set (the structured message) and `content` is its plain text. The server must:

- Check `body` node by node exactly like `validBody` in `src/lib/messageBody.ts` (known blocks, inlines and marks only; links http/https only; ids `[\w-]{1,100}`; quotes don't nest; at most 2,000 blocks and 10,000 nodes in all, counting blocks, list items and inlines, empty ones included; unknown fields dropped) and answer `400` "That message couldn't be read." otherwise.
- Store `content` as the body's plain text (`bodyText`), and take mentions and task keys from the body (`mentionsOf`, `bodyTaskKeys`), not from `content`.
- Allow up to **40,000** characters of plain text (`400` "Keep the message under 40000 characters.").

Without `body` the server parses `content` as before.

### Drafts

| Call | Route | Body | Returns |
|---|---|---|---|
| My drafts | `GET /api/workspaces/:id/drafts` | | `Draft[]` (`channelId, rootId, body, updatedAt`) for channels I can read |
| Save a draft | `PUT /api/channels/:id/draft` | `{ body, rootId }` | the `Draft`, or `null` when the body is empty (the draft is deleted) |

One draft per (user, channel, thread root). The composer saves 500ms after typing stops (and at once when the person leaves the channel), and deletes the draft when the message is sent. A client sends one place's draft writes one at a time, in order, so the last write the server gets is the newest; the server keeps the last write. Each save sends `draft.updated` `{ userId, channelId }` to that user's own connections (client handler `onDraftChanged`).

## Phase 1 · Feature 6: optimistic send, edit in place, delete with Undo

### Optimistic send

The client shows a message the moment it's sent ("Sending…") with a `clientId` it made up (`crypto.randomUUID()`), and sends one message at a time per channel, in order. Send must stay idempotent by `(sender, clientId)` (feature 1): a resend after a lost response returns the stored message. While offline (`navigator.onLine` false) messages wait and go when the connection is back; when a request never reaches the server (`ApiError` status 0) although the browser is online, the client waits 1s, 2s, 4s… up to 30s between tries, and goes at once when the browser reports `online` or the person presses Retry; a refusal (4xx/5xx) shows "Not sent. Retry · Delete" with the server's `detail` as the reason.

### Edit

`PATCH /api/messages/:id` (and `/api/replies/:id`) takes `{ content, body? }` like send: with `body`, check it with `validBody` and store its plain text as `content`. Author only.

### Delete and restore

| Call | Route | Rule |
|---|---|---|
| Delete | `DELETE /api/messages/:id` (`/api/replies/:id`) | The author or an Admin (spec §9). Soft: the row stays with `deletedAt` and empty content, body, files, mentions and reactions. |
| Undo | `POST /api/messages/:id/restore` (`/api/replies/:id/restore`) | Only whoever deleted it, within **10 seconds** (the client's Undo toast is 5s; the rest is for the request to arrive). Brings back content, body, files, mentions, reactions and task links. `400` "This message isn't deleted." / "It's too late to undo that."; `403` for anyone else. Sends `message.updated`. |

What a delete takes is kept only for the Undo window, then dropped (retention beyond that is OPEN item 8). The client asks before deleting a message with replies or files that aren't deleted already, and offers Undo either way. Deleting a message takes its files off that message only; a file shared elsewhere stays there (slice 6), and Delete file removes it everywhere.

## Phase 1 · Keyboard shortcuts (spec 10)

- **U** (or Mark unread in a message's ⋯ menu) calls Mark unread with that message's `seq`. The channel stays unread while it's open: being on screen doesn't mark it read again until the person leaves it or marks it read themselves (Esc, the header's Mark all read, the unread bar).
- **Esc** marks the open channel read: `POST /api/channels/:id/read` with no `seq`, as the header does.
- **Shift+Esc** marks everything read after a confirm: one `POST /api/channels/:id/read` (no `seq`) per channel or DM in the sidebar with `unreadCount > 0`, sent together. A bulk route (for example `POST /api/workspaces/:id/read`) can replace this later without the person noticing.
- **Alt+↑/↓** and **L** need nothing from the server.

## Phase 2 · Slice 2: threads (spec 6.7)

### Following

| Call | Route | Body | Returns |
|---|---|---|---|
| Follow a thread | `PUT /api/messages/:id/follow` | — | `204` |
| Stop following | `DELETE /api/messages/:id/follow` | — | `204` |

- `:id` is the thread's root: a top-level message. A reply also sent to the channel (see below) has no thread of its own: `400` "Threads are one level only.". Read access to the channel, as for reading it; `404` / `403` as usual.
- Each person's own choice is stored (spec §7 `ThreadFollow`: `userId`, `rootId`, `following`). Without one, the defaults decide: you follow a thread when you wrote its root, replied to it, or were mentioned by name (`@[Name](userId)`, not `@all`) in the root or a reply.
- Replying, or being mentioned in a new reply, clears that person's choice, so they follow again.
- Every top-level message read (`GET` a message, a channel's pages) carries `following: boolean`, worked out for the person reading. A broadcast reply listed in the channel (below) doesn't: it has no thread of its own.
- A change sends `messageChanged` `{ channelId, messageId }` (spec §8 `thread.updated`).
- Delivery (the bell, Activity, the Threads view's counts) comes in later slices; they read the same state.

### Replies, and Also send to #channel

`POST /api/messages/:id/replies` takes `{ content, body?, alsoInChannel?, fileIds?, clientId? }`. As with send, a `clientId` the same person already used on this thread returns the reply it stored, with no second reply, count or event (spec §8); the client sends one with every reply and retries network failures with it.
- From the rich composer, `body` is the reply (checked with `validBody`, its plain text stored as `content`), as for sending a message.
- With `alsoInChannel: true` the reply is also sent to the channel (spec 6.7 broadcast). It stays one record, the reply, and also takes the channel's next `seq`. It returns `alsoInChannel: true` and `seq`; without the flag a reply has neither.
- A channel's pages (`GET /api/channels/:id/messages`, `?after=`, `/messages/first`) list it at its `seq` as a message:
  - its `id` is the reply's id;
  - it carries `broadcast: { rootId, rootText }`, where `rootText` is the root's first line, worked out on read and `""` once the root is deleted;
  - its text, body, files, reactions, mentions, `editedAt` and `deletedAt` are the reply's.
- Edits, deletes, restores and reactions on it go to `/api/replies/:id`; through `/api/messages/:id` they answer `404`. `GET /api/messages/:id` returns it as the channel lists it, with no replies (`GET …/replies` is `[]`); replying to it or following it answers `400` "Threads are one level only.".
- It counts as unread like any message from someone else, and a deleted one leaves the channel the way a deleted message without replies does.
- `replyReceived` carries the reply with `alsoInChannel`; the channel's list refreshes on it as it does for any reply (spec §8 `message.created` and `thread.updated`).

## Phase 2 · Slice 3: Activity and channel notifications (spec 6.11, 6.12)

### Notification level

| Call | Route | Body | Returns |
|---|---|---|---|
| Set the level | `PATCH /api/channels/:id/me` | `{ notifyLevel: "all" \| "mentions" \| "none" }` | The channel as I see it. |

- Mine only, like star and mute, with the same read access rule. Any other value: `400` "Choose All new messages, Mentions or Nothing.".
- The defaults (a person with no row): `"mentions"` for a channel, `"all"` for a DM. Rows written before levels could be chosen hold `"all"` for channels; read them as `"mentions"` (the mock migrates them).
- It sends `read.marker_updated` `{ userId, channelId }` like star and mute.
- What a level does in the sidebar (client side, spec 5.1): All counts every unread message, Mentions counts my mentions, Nothing shows no count; the row is still bold with unread. Muted wins over the level: never bold, no count, and the row goes last in its group.
- A channel at Nothing is left out of Activity and of the bell's mentions (`GET /api/mentions`). Both leave it out before taking their newest items (the bell's 50, Activity's 100), so a busy channel at Nothing never pushes other mentions out. Its stored items are kept, so they show again when the level changes back.
- Keywords, desktop, mobile and email delivery, Do Not Disturb and the default level: see Preferences above (slice Z).

### Activity item

| Field | Type | Rule |
|---|---|---|
| `id` | string | For a mention, the mention's id (the bell's); else the stored item's. |
| `kind` | `"mention" \| "reaction" \| "thread" \| "reminder" \| "task"` | `task` (UX Phase 2): task news for me, with `taskEvent` `"assigned" \| "status" \| "taskComment"` and, for a move, `statusLabel`. |
| `read` | boolean | A mention's read state is the bell's (`mentionReads`): marking it read in one marks it in the other. |
| `createdAt` | ISO time | When it happened. |
| `workspaceId` | string | |
| `actorId`, `actorName` | string | Who mentioned me, reacted, or replied. |
| `channelId` | string \| null | `null` only for a mention in a task comment. |
| `messageId` | string \| null | The message, or for a reply its thread's root. |
| `replyId` | string \| null | The reply, when it happened in a thread. |
| `taskKey`, `projectId` | string \| null | A comment mention's task and project. |
| `excerpt` | string | The text now, mentions as `@Name`, at most 120 characters. |
| `emoji` | string \| null | A reaction's emoji. |

### Routes

| Call | Route | Body | Returns |
|---|---|---|---|
| My Activity | `GET /api/workspaces/:id/activity` | — | Up to 100 items in that workspace, newest first. |
| Mark read | `POST /api/workspaces/:id/activity/read` | `{ ids? }` | `204`. Without `ids`: every item the list would return. With `ids`: any of my mentions (not only the newest) and my stored items. |

What the list holds, for the signed-in person:

- **Mentions** of me, as `GET /api/mentions` has them (spec 6.12 Mentions), in this workspace, worked out from each message or reply as it reads now (an edit can add or remove one; `@channel` counts, and `@here` for whoever it reached: the server records, when `@here` first appears in a message or reply, which of the channel's other members were active, as `hereIds` on the row, and Activity reads that, so a later change of presence changes nothing; an edit that takes `@here` out drops it).
- **Reactions** to my messages and replies (spec §7 `Notification`): one item per person and emoji. Taking the reaction back removes the item; my own reactions make none, and neither do reactions in a channel I can no longer read.
- **Thread replies** in threads I follow (the following rules of slice 2): one item per reply, stored for every follower except the replier and anyone who can't read the channel. A reply that mentions me as it reads now is listed once, as the mention, not again as a thread item.
- Items whose message or reply is deleted are left out, as are channels at Nothing and channels I can no longer read (I left a private channel or was taken off it): the read check runs when the list is read, not only when an item is stored, since the excerpt is the text as it is now.
- Reading a message in its channel doesn't mark its Activity item read; opening the item (or Mark all read) does.
- **Task news** for me (UX Phase 2, 2.3), worked out on read and also in `GET /api/mentions` (`source` `"assigned"`, `"status"`, `"taskComment"`): someone else assigned me a task (the history line that set me, creation included, so it stays mine after the task moves on); someone else moved a task assigned to me now (`statusLabel` is the column it went to); someone else commented on a task assigned to me now (a comment that mentions me is that mention alone). Only on projects I'm on; they share the mentions' read state. A task update (`ticket.updated`) refreshes the bell and Activity.

### Real-time event

| Client handler | Wire event | Payload |
|---|---|---|
| `onNotificationCreated` | `notification.created` | `{ userId }`, sent only to `userId`'s own connections: when a reaction or thread item is stored for them, and when a new message or reply mentions them (by name, `@channel` as a member, or `@here` as a member who is active), once per person per message. The client asks before sending `@channel` or `@here` to a channel of more than 25 members (spec 6.8); the server needs no rule for that. |

The client refreshes Activity on it, and on `message.updated` (an edit can add or remove a mention), a comment, `read.marker_updated` and `channel.updated`, `member.joined` or `member.left` (client handler `onChannelChanged`: leaving, removal, archiving and privacy decide what Activity and the bell may show). It no longer refreshes Activity on every `message.created` or new reply.


## Phase 2 · Slice 4: Channel details (spec 6.10, §9)

### Channel fields

| Field | Type | Rule |
|---|---|---|
| `description` | string | What the channel is for, trimmed, at most 250 characters; `""` when not set. A DM has `""`. |
| `whoCanPost` | `"everyone" \| "admins"` | Who may post new messages and replies. `"everyone"` by default (and for every DM). |

Both are on every channel the API returns (`GET` a channel, the workspace's channels, create, update).

### Routes

| Call | Route | Body | Returns |
|---|---|---|---|
| Edit details | `PATCH /api/channels/:id` | `{ name?, topic?, description?, whoCanPost? }` | The channel as I see it. |
| Add people | `POST /api/channels/:id/members` | `{ userIds }` | The channel as I see it. |
| Remove someone | `DELETE /api/channels/:id/members/:userId` | — | The channel as I see it. |

Rules:

- **Who:** all three need `channel.manage` (its members, or an Admin for a public channel). A private channel I'm not in answers `403` "You're not in this channel.", as every channel route does; anyone else who may not change it gets `403` "Only its members can change this channel.". Never a DM (`400` "Direct messages can't be edited.") or a project's channel (`400` "This channel follows its project."; its people are the project's), and not while the channel is archived (`400` "This channel is archived."): it is read-only until restored, its details and people included.
- **Edit details:** name and topic as before (a rename posts `renamed`, a topic change posts `topic`). `description` over 250 characters: `400` "Keep the description under 250 characters."; a description change posts nothing. `whoCanPost` must be `"everyone"` or `"admins"` (`400` "Choose Everyone or Only admins."), and only an Admin may change it (`403` "Only admins can change who can post."). The body no longer takes `memberIds`: people change through the members routes.
- **Add people:** `userIds` are people in the workspace (`404` for an unknown one); duplicates and people already in the channel are skipped. None given: `400` "Pick someone to add."; nobody new: `400` "Everyone you picked is already in #name."; myself, when I'm not in the channel: `400` "Join the channel instead." (joining is the way in). It posts a system message `{ kind: "added", userIds }` (the ones added, in order), read as "added Nour El-Sayed and Omar Hassan.".
- **Remove someone:** not myself (`400` "Leave the channel instead."), and only someone in the channel (`400` "They’re not in #name."). It posts `{ kind: "removed", userId }`, read as "removed Omar Hassan from the channel.". A private channel may go down to just me this way (the "Add at least one person" rule is for a new channel). Someone taken off a private channel can no longer read it, and its messages leave their bell and Activity at once.
- **Who can post:** at `"admins"`, `POST /api/channels/:id/messages` and `POST /api/messages/:id/replies` from anyone but an Admin answer `403` "Only admins can post in #name.". Reactions, edits and deletes of existing messages are not affected.
- Each change sends `channel.updated` (client `onChannelChanged`) to the channel's members, and for Add people and Remove someone to the people added or removed too: they aren't in the channel's group yet, or any more, and without it the removed person keeps a private channel and its messages on screen. The system message goes to the channel as `message.created`.
- Writes stay idempotent (spec §8): a retried `POST /api/channels/:id/messages` with a `clientId` that was already stored returns that message, even if the channel changed to `"admins"` in between; the rights are checked for a new message only.

Email invites and "When new people join Spark Systems, add them to #channel" (the admin's default-channel switch) are slice 5, below; guests get a slice of their own. A channel's linked project is shown only for a project's own channel; linking other channels waits.


## Phase 2 · Slice 5: Add people with email invites (spec 6.10, §7 Invitation)

### Invitation

| Field | Type | Rule |
|---|---|---|
| `id` | string | |
| `workspaceId`, `channelId` | string | The channel it invites to. |
| `email` | string | Trimmed and lowercased. |
| `role` | `"guest"` | Every email invite is a guest who can see this channel only, until the workspace has a policy for member invites. |
| `invitedBy` | string | A user id. |
| `createdAt` | ISO time | |
| `status` | `"pending" \| "accepted" \| "revoked"` | Pending until it's accepted from the email or revoked. |

Channels also carry `isDefault` (boolean, `false` unless set): new people in the workspace join a default channel. Only public channels can be default ones. It is on every channel the API returns.

### Routes

| Call | Route | Body | Returns |
|---|---|---|---|
| Add people (changed) | `POST /api/channels/:id/members` | `{ userIds, emails? }` | The channel as I see it. |
| Invited | `GET /api/channels/:id/invitations` | — | Its pending invitations, oldest first. |
| Revoke | `DELETE /api/invitations/:id` | — | Nothing (`204`). |
| Default channel (changed) | `PATCH /api/channels/:id` | `{ isDefault }` and the slice 4 fields | The channel as I see it. |

Rules:

- **Add people with emails:** people and emails go in one write, under the slice 4 rules (who, never a DM, a project's channel or an archived channel). Emails are trimmed and lowercased. Each must be an email: letters, digits and `. _ % + ' -` before the `@`, then a domain of letters, digits and hyphens with at least one dot (`400` "x isn't an email address."; a pasted "sam@client.com;" is refused, never stored beside "sam@client.com"). The client splits a pasted list on commas and semicolons before sending. and at most 20 go in one call (`400` "Invite up to 20 emails at a time."). The email of someone in the workspace adds that person instead. Other emails are invites, which only Admins send (`403` "Only admins can invite people by email."). People already in the channel and emails with a pending invite to it are skipped; if nothing is new: `400` "Everyone you picked is already in #name or invited." (or "…already in #name." when no emails were sent).
- **What it posts:** people added post `{ kind: "added" }` as before. An invite posts nothing, so emails stay out of the channel; the guest's join line comes with accepting (the guests slice).
- **The email:** the backend sends each new invite by email, with a link to accept it. The prototype only stores the invitation.
- **Invited:** for whoever may change the channel (`channel.manage`); a private channel I'm not in answers `403` "You're not in this channel.", any other refusal `403` "Only its members can change this channel.".
- **Revoke:** whoever sent it, or an Admin (`403` "Only whoever invited them, or an admin, can revoke this."). Not while the channel is archived (`400` "This channel is archived."). Revoked already: `400` "This invitation was revoked already."; accepted: `400` "They joined already.". The same email can be invited again afterwards.
- **Default channel:** only an Admin changes `isDefault` (`403` "Only admins can choose default channels."), it must be `true` or `false` (`400` "Turn the default channel on or off."), and a private channel can't be one (`400` "A private channel can't be a default channel."). When someone joins the workspace, the backend adds them to its default channels that aren't archived; the prototype has no way to join a workspace, so it only stores the flag.
- **Events:** an invite and a revoke send `channel.updated` (client `onChannelChanged`) to whoever may change the channel; the client refreshes the channel's Invited list on it.

Accepting an invite (the link in the email, a guest account, what a guest can see, the Guest tag) comes in the guests slice.


## Phase 2 · Slice 6: Files (spec 6.8 Attach menu, 6.9, §7 File, §8 files)

### The file record

One record for chat files, task comment files and project files (spec §7 File; MessageFile is the server's join of messages and files):

| Field | Type | Rule |
|---|---|---|
| `id`, `name`, `mimeType`, `size`, `createdAt` | as before | `name` is the uploaded file's own; `mimeType` is the server's sniffed type, not the browser's. |
| `uploadedBy` | string | A user id. |
| `title` | string | What the card shows; the file's name until Edit file details changes it. Trimmed, 1–250 characters. |
| `description` | string | `""` until set; at most 1,000 characters. |
| `scanStatus` | `"pending" \| "clean" \| "blocked"` | A file can't be opened, sent or shared until it's `"clean"`. |
| `thumbUrl`, `previewUrl` | string \| null | Made by the server: a small image, and for office and RTF files a converted PDF preview. |
| `deletedAt` | ISO time \| null | Set by Delete file; the record stays so where it was shared can say "This file was deleted." |

Messages and replies carry the full records in `attachments`, as they always have.

### Routes

| Call | Route | Body | Returns |
|---|---|---|---|
| Ask to upload | `POST /api/files/upload-url` | `{ channelId, name, size, mimeType, snippet? }`, or `{ projectId, name, size, mimeType }` for a task's file | `{ file, uploadUrl }`: the record (`scanStatus: "pending"`) and a short-lived address for the bytes. |
| The bytes | `PUT <uploadUrl>` | The file's bytes, `Content-Type` its type | To object storage, not the API. The browser reports progress from this request. |
| Upload complete | `POST /api/files/:id/complete` | — | The file, once the server has sniffed its type, scanned it and made any thumbnail. |
| Send (changed) | `POST /api/channels/:id/messages` | `{ content, clientId?, body?, fileIds? }` | The message. |
| Reply (changed) | `POST /api/messages/:id/replies` | `{ content, body?, alsoInChannel?, fileIds? }` | The reply. |
| Open | `GET /api/files/:id` | `?download=1` (optional) | The bytes, or a redirect to a short-lived signed address. With `?download=1` (the client's Download, `downloadUrl` in `fileTypes.ts`), and always for HTML and SVG, sent with `Content-Disposition: attachment`. Every response, the signed address's too, sends `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. |
| Details | `GET /api/files/:id/details` | — | `{ file, sharedIn: [{ channelId, messageId, replyId, at }], taskKeys, projectIds }`, as I may see them. |
| Edit file details | `PATCH /api/files/:id` | `{ title?, description? }` | The file. |
| Delete file | `DELETE /api/files/:id` | — | Nothing (`204`). |
| Share | `POST /api/files/:id/share` | `{ channelId, content? }` | The new message. |
| Remove from a project (moved) | `DELETE /api/projects/:projectId/files/:fileId` | — | Nothing. It was `DELETE /api/files/:id` with the project-file link's id; that path now means the file itself. |

Rules:

- **Upload:** whoever may post in the channel (`checkCanWrite`: a private channel's members, not while archived, and only Admins in an Only admins channel). The same file types as everywhere else (`fileTypes.ts`: PDF; images: PNG, JPG/JPEG, GIF, WebP, SVG, BMP, HEIC, TIFF; video: MP4, WebM, MOV; audio: MP3, WAV, M4A; office: Word, Excel, PowerPoint, RTF, OpenDocument, Pages, Numbers, Keynote; CSV, TSV, text, Markdown, JSON, XML, HTML; ZIP, RAR, 7Z; design: AI, PSD, EPS, Figma, Sketch); others `400` "That type of file can't be added.". HTML and SVG can carry script, so Open always sends them as attachments (the client shows an SVG only through `<img>` and never opens HTML). Empty: `400` "That file is empty.". The size limit is a server setting (1 GB suggested by the spec; the prototype keeps 25 MB), mirrored in the client by `VITE_MAX_FILE_MB` so the browser refuses the same files before uploading: `400` "Files can be up to N MB.". A file never sent is the uploader's only, and the server removes it after 24 hours.
- **Send and reply with files:** at most 10 (`400` "Attach up to 10 files to a message."); each must exist and not be deleted (`404`), be mine (`403` "You can only send files you uploaded."), and be clean (`400` "x is still being checked." / "x was blocked."). With files the text may be empty, and an edit of a message that has a file may empty it too. A retried send with the same `clientId` still returns the first message.
- **Open and Details:** for whoever reads a channel the file is shared in, is on a project or task that has it, or uploaded it and hasn't sent it yet; anyone else gets `404`, so nobody learns it exists. Opening a blocked file: `400` "This file was blocked."; one still being checked: `400` "This file is still being checked."; a file counts as sent once it's in a message or reply (or one deleted within Undo), after which its uploader opens it only through where it's shared.
- **Edit file details and Delete file:** whoever uploaded it, or an Admin (`403` "Only whoever uploaded it, or an admin, can change this file."; spec §9). Not while a project or channel it's in is archived (`400` "This project is archived. Restore it first." / "This channel is archived."). Name: `400` "Give the file a name." / "Keep the name under 250 characters."; description: `400` "Keep the description under 1,000 characters.". Delete keeps the record with `deletedAt` and throws the bytes away.
- **Share:** whoever uploaded it, or an Admin (`403` "Only whoever uploaded it, or an admin, can share this file."), so nobody else carries a file from a private channel into a wider one; into a channel I can post in (as sending); the file must be clean. It posts a new message with the file and my optional text.
- **The client and the scan:** an upload is ready to send only once `complete` returns it `"clean"`; a `"blocked"` file's tray card says "This file was blocked." and can only be removed, and a `"pending"` one can be tried again.
- **Events:** sharing sends `message.created` for the new message and `file.shared`; Edit file details sends `file.updated`, and Delete file `file.deleted` (client handler `onFileChanged`, `{ fileId }`), plus `message.updated` for every message and reply that shows the file, and `files.changed` for any project that lists it. The client refreshes the file's details on `onFileChanged`.

- **Task files (7 Nov 2026):** `upload-url` with `projectId` is for a task's file: whoever edits the project's tasks (`task.manage`), not while it's archived; the file is the uploader's alone until a task's `attachmentIds` names it. `details.taskKeys` counts the tasks that hold a file as well as those whose comments do. See the company spec §4.4 amendment for the task routes and `GET /api/projects/:id/all-files`.

Save for later, Add to folder and Add from Flow files come with the channel Files tab (Phase 3, slice W); voice and video messages in Phase 4.

## Phase 3 · Slice X: text snippets (spec 6.9)

- **A snippet is a chat file:** `upload-url` takes `snippet: { language }` with `language` one of `text`, `bash`, `csharp`, `css`, `html`, `javascript`, `json`, `markdown`, `python`, `sql`, `typescript`, `yaml` (`400` "That snippet type isn't supported."), and the file must be a `.txt` (`400` "A snippet is a .txt file."). Everything else (bytes, `complete`, the scan, Share, Edit file details, Delete file, File details) is the same as any file.
- **The record:** every file carries `snippet: { language } | null`; a snippet's `title` starts as its name without `.txt`.
- **Sending:** the client creates the snippet, then sends it like any file (`fileIds`), in a message or a thread reply, with the optional message as the text.
- **/remind (spec 6.8):** `POST /api/saved/notes { channelId, text, remindAt }` makes a saved item whose `target` is `{ kind: "note", text, channelId }` (In progress; `400` "Write what to remind you about.", "Keep a reminder under 1,000 characters.", "Pick a time in the future."; `404` for a channel I can't read). It lists in Saved with me as the author and fires like any reminder: Flowbot's card quotes the words, `channelId` is `""` (nothing to view), and no Activity item. `savedChanged` as for any saved item.
- **Shortcuts (spec 6.8):** the built-in `/` commands call the endpoints above (mute, channel update, leave, members, tasks); nothing new. `POST /commands/:name` waits for app commands (Phase 4).

## Phase 3 · Slice R: scheduler and Flowbot (spec 5.1 Apps, §7 Reminder and ScheduledMessage)

The server keeps reminders and scheduled messages and fires them from a job queue at their time. Slices S (Remind me, Saved) and T (Schedule send, Drafts & sent) add the routes that create and change them; this slice fixes the records and what firing does.

### Flowbot

Flowbot is an app, not a person: it is in no user list and has no role. Its id is `app-flowbot` (`lib/flowbot.ts`). Each person gets one DM with it per workspace (`kind: "dm"`, `memberIds: [userId, "app-flowbot"]`, private), made the first time Flowbot has something to say there. The sidebar lists it under Apps.

- Nobody posts in it: a new message or reply there is `403` "Flowbot sends reminders here. It can’t read replies." Reactions are allowed.
- Its messages are plain text (`body` is one paragraph of text), so a quoted mention or task key notifies nobody. They carry `flowbot`: `{ kind: "reminder", savedId, channelId, rootId, target: { kind: "message" | "reply", id } }` (`rootId`: a reply's thread) or `{ kind: "scheduleFailed", scheduledId }`, for the card slices S and T draw.

### Reminder

A reminder lives on its saved item (slice S, below: `remindAt`, `firedAt`). When due, the job sets `firedAt` and Flowbot sends its owner:

- `Reminder: “<the text, up to 150 characters>” from <author>.`
- `Reminder about a message that was deleted.` when it is gone.
- `Reminder about a message you can no longer see.` when its owner can't read the channel any more.

### ScheduledMessage

`{ id, userId, workspaceId, channelId, rootId, content, body, sendAt, tz, status: "scheduled" | "sent" | "failed", sentId, failure }`. When due, the job sends it as its author with every check a send makes (who may post, archived, Only admins, the text). Sent: `status: "sent"` and `sentId` is the new message or reply. Refused: `status: "failed"`, `failure` is the refusal's sentence, and Flowbot sends `Your scheduled message to #<channel> wasn’t sent. <failure>` (“a thread in #<channel>”, or “a conversation” for a DM).

### Events

Firing sends what a send would: `message.created` (or the reply event) for what was posted, `notification.created` for whom it mentions, and `channel.updated` when Flowbot's DM was just made. Each item fires once, however many workers run. In the prototype every tab runs a pass every 15 seconds inside one IndexedDB transaction, so only one tab fires each item.

## Phase 3 · Slice S: Saved and Remind me (spec 6.4, 6.5, 6.12, §7 SavedItem)

### Saved item

`{ id, userId, workspaceId, target: { kind: "message" | "reply", id }, status: "inProgress" | "archived" | "completed", remindAt, firedAt, savedAt }`. One per person and target. The spec's separate Reminder record is folded into it: Remind me sets `remindAt` on the same item ("Reminders also appear in Saved").

A read adds what the Saved view shows, worked out each time: `channelId`, `rootId` (the thread a saved reply opens in), `authorId`, `authorName`, `text` (as people read it), `createdAt`, and `gone`: `"deleted"` or `"hidden"` (I can no longer read the channel), with no text or author then.

### Routes

| Call | Route | Body | Returns |
|---|---|---|---|
| List | `GET /api/workspaces/:id/saved` | — | My items there: those with a reminder first (soonest first), then the newest saved. The client splits them by status. |
| Save / Remind me | `PUT /api/saved` | `{ target, remindAt? }` | The item. Saves it In progress (again, if it was saved before); `remindAt` also sets its reminder and clears `firedAt`. |
| Change | `PATCH /api/saved/:id` | `{ status?, remindAt? }` | The item. |
| Remove | `DELETE /api/saved/:id` | — | Nothing (`204`). |

Rules:

- **Save:** the target must be one I can read (`404` otherwise) and not deleted (`400` "This message was deleted.").
- **Reminder time:** ISO 8601, in the future (`400` "Pick a time in the future."; not a time: "Pick a date and time."). The client works out the presets (In 20 minutes, In 1 hour, In 3 hours, Tomorrow 9:00 AM, Next week Monday 9:00 AM) in the person's own time zone.
- **Change:** completing or archiving cancels the reminder (`remindAt: null`). A new time brings it back to In progress and clears `firedAt`; `remindAt: null` cancels it. Snooze on Flowbot's card is a new time; Mark complete is `status: "completed"`.
- **Only mine:** someone else's item is `404`, so nobody learns it exists.
- **Firing:** an In progress item whose `remindAt` has passed and that hasn't fired. Besides Flowbot's DM (slice R), it stores an Activity item of kind `"reminder"` (actor Flowbot) while I can still read the message. The item stays In progress.
- **Events:** every change, and a reminder firing, sends `saved.changed` (`{ userId }`, client handler `onSavedChanged`) to that person; firing also sends `notification.created`.

Saving files (the file menu's Save for later) comes with the Files tab (slice W).

## Phase 3 · Slice T: Schedule send and Drafts & sent (spec 6.8 Schedule menu, 6.12, §7 ScheduledMessage)

The record is slice R's ScheduledMessage. Only `"scheduled"` and `"failed"` ones are listed; a sent one is a message in Sent.

### Routes

| Call | Route | Body | Returns |
|---|---|---|---|
| List | `GET /api/workspaces/:id/scheduled` | — | Mine there, still to go out or failed, soonest first. |
| Schedule | `POST /api/scheduled` | `{ channelId, rootId, body, sendAt, tz }` | The record. The text is worked out from the body. |
| Reschedule / edit | `PATCH /api/scheduled/:id` | `{ sendAt?, body? }` | The record. A new time puts a failed one back to `"scheduled"`. |
| Delete | `DELETE /api/scheduled/:id` | — | Nothing (`204`). |
| Send now | `POST /api/scheduled/:id/send-now` | — | The new message or reply. |
| Sent | `GET /api/workspaces/:id/sent` | — | `[{ target: { kind, id }, channelId, rootId, text, createdAt }]`: my messages and replies there that I can still read, not deleted, newest first, at most 50. Channel events and task cards aren't listed; a reply also sent to the channel is listed once, as the reply. |

Rules:

- **Schedule:** checks what a send checks, at once (who may post: archived, private membership, Only admins; the text: `400` "Write a message first."), so one that can't go out isn't kept; the job checks again at its time. `rootId` must be a message in that channel (`404`). `sendAt` in the future (`400` "Pick a time in the future."). Text only: files can't be scheduled yet.
- **Change, Delete, Send now:** only mine (`404` otherwise). A sent one: `400` "That message was already sent." Send now that's refused (`400` with the refusal's sentence) changes nothing.
- **Events:** creating, changing, deleting, sending and failing send `scheduled.changed` (`{ userId }`, client handler `onScheduledChanged`; the spec's `scheduled.sent`) to the author; sending also sends what a send would.
- **Times:** the Schedule menu's Tomorrow at 9:00 AM and Monday at 9:00 AM, and Custom time…, are worked out in the viewer's time zone; `tz` is kept to say when it sends.

## Phase 3 · Slice W: pins, files, folders, bookmarks (spec 6.1, 6.2, 6.5, 6.9, 6.10)

| What | Route | Body | Answer |
|---|---|---|---|
| Pins | `GET /api/channels/:id/pins` | | `PinnedMessage[]` (`{ message, pinnedBy, pinnedAt }`), newest pin first |
| Pin, unpin | `PUT` / `DELETE /api/messages/:id/pin` | | `204`. Whoever may post; pinning again is fine; pinning posts the system line `{ kind: "pinned", messageId }` |
| Files in a channel | `GET /api/channels/:id/files?type&from&since&folderId&cursor` | | `Page<ChannelFile>` (`{ file, senderId, at, messageId, replyId }`), newest first, 50 a page; `type` is `image`, `pdf`, `document`, `snippet`, `video` or `other` |
| Files I may share | `GET /api/workspaces/:id/files?q` | | `ShareableFile[]` (`{ file, channelId, projectId }`), 30 at most: mine; an Admin's, any they can see |
| Folders | `GET` / `POST /api/workspaces/:id/folders` | `{ name }` | `Folder[]` by name / the folder (`400` "Name the folder.", "There’s a folder called X already.") |
| File in a folder | `PATCH /api/files/:id` | `{ folderId }` (or `null`) | the file; whoever may edit its details; `400` "That folder doesn’t exist." |
| Bookmarks | `GET` / `POST /api/channels/:id/bookmarks`, `PATCH` / `DELETE /api/bookmarks/:id` | `{ title, url }` | http or https only (`400` "Use a web address (https://…)."); an empty title takes the host; an address the channel already has is refused (`409` "That link is already a bookmark here."); whoever may post |
| Save a file | `PUT /api/saved` | `{ target: { kind: "file", id } }` | the saved item; its view carries `file` and `messageId` (where it was first shared that I can read) |

- **Records:** `Attachment.folderId` (null for none); a message's `pin: { by, at }` is worked out on read (absent when not pinned); deleting a message unpins it.
- **Sending files I didn't upload:** `fileIds` may name a file an Admin can see (the Share rule); anyone else only their own.
- **Events:** pins and bookmarks send `channel.updated` (`channelChanged`), pins also `message.updated`; filing a file sends `file.updated`. New messages, replies and file changes refresh a channel's Files list.

## Phase 4 · Slice PG: channel page (spec 6.14)

Design: `docs/superpowers/specs/2026-11-10-channel-page-tab-design.md`.

| What | Route | Body | Answer |
|---|---|---|---|
| Read | `GET /api/channels/:id/page` | | `PageView` (`{ channelId, body, version, updatedAt, updatedBy, editors, editing }`); a channel without a page is version 0, an empty body |
| Save | `PUT /api/channels/:id/page` | `{ body, baseVersion }` | `PageView`; `409` while someone else holds it or a newer version exists; `400` "This page is too long. Shorten it to save." or "Something on this page can’t be saved."; `400` "This channel is archived."; `403` for someone who may not post |
| Claim | `POST /api/channels/:id/page/editing` | | `{ editing }`: my hold, renewed for 60 s, or the other person's (no error) |
| Let go | `DELETE /api/channels/:id/page/editing` | | `204`; nothing when I don't hold it |
| History | `GET /api/channels/:id/page/versions` | | `PageVersionSummary[]` (`{ id, version, savedAt, savedBy }`), newest first, 100 at most |
| A version | `GET /api/channels/:id/page/versions/:versionId` | | `{ id, version, savedAt, savedBy, body }`; `404` for an unknown one |
| Restore | `POST /api/channels/:id/page/restore` | `{ versionId, baseVersion }` | `PageView`, by save's rules; `409` "Nour El-Sayed is editing. Try again when they’re done." |

- **Records:** `Page` (`body`, `version`, `editing: { userId, until } | null`), `PageVersion` and `PageMention`. The body is `PageBody`: the message body's blocks plus `h1`–`h3`, `check` (`items: { checked, children }`) and `table` (`rows` of cells of inlines, the first row the header), checked by the rules of `validPage` (`src/lib/pageBody.ts`): no `@channel` or `@here`, tables 1–10 columns and up to 100 rows, all rows the same width, at most 2,000 blocks and 50,000 characters. The server is the authority.
- **Who:** anyone who can read the channel reads the page, its history and any version; whoever may post a message edits it (`403` otherwise).
- **Hold:** one editor at a time. A claim or a save holds the page for 60 s; an expired hold counts as none. A save checks, in order: who may post, the body, another person's hold (`409`), then `baseVersion` against the page's version (`409`, an optimistic-concurrency check).
- **409 detail:** the sentence the page shows: "Nour El-Sayed started editing first. Your last changes aren’t saved.", "Nour El-Sayed saved changes before you. Your last changes aren’t saved.", or, when the newer version is the caller's own (another tab), "You changed this page in another tab. Your last changes here aren’t saved." The client offers the same two buttons for any of them; the spec's `{ code, by }` is not needed.
- **Versions:** one person's saves within 10 minutes of their first make one history entry (its `savedAt` is the last); another person, or a save after that, starts a new one. The newest 100 are kept. A restore always starts its own entry and never removes newer ones. Saving the same body again changes nothing.
- **Mentions:** a save that names someone who wasn't named before (and isn't the saver, can read the channel and is active) stores a mention for them, with the text of the block that names them, cut to 120 characters. It shows in `GET /api/mentions` (`source: "page"`) and Activity (`kind: "mention"`, `page: true`, `messageId: null`) while they can read the channel, and shares their mention read state. It opens `/w/:ws/c/:channelId?tab=page`.
- **Audit:** page saves, claims and restores are not in the audit log; the page's history is their record.
- **Events:** `page.saved` (`pageSaved`, `{ channelId, version, userId }`) after a save or restore; `page.editing` (`pageEditing`, `{ channelId, userId, until }`, `userId` and `until` null when let go) when the holder changes and on every renewal, a claim or a save with nothing new (a reader keeps a hold for 60 s from when the page carrying that `until` arrived, never by comparing `until` with its own clock); `DELETE …/page/editing` is sent with `keepalive`, as a closing tab's last call; `notification.created` to each person newly mentioned.

## Phase 4 · Slice CI: channel intro (spec 6.14)

Design: `docs/superpowers/specs/2026-11-11-channel-intro-and-templates-design.md`.

| `Channel` field | Type | Rule |
|---|---|---|
| `createdAt` | ISO string or `null` | When the channel or conversation was made. Channels made before it was kept are dated by their first message; `null` when they have none. |
| `createdBy` | user id or `null` | Who made it; `null` when nobody knows (channels made before it was kept). |

- **No new routes.** Pick a template saves through `PUT /api/channels/:id/page`, with save's rules. Link a project adds a bookmark through `POST /api/channels/:id/bookmarks`, titled with the project's name, at the absolute address of its Overview.
- **Bookmarks to Flow:** a bookmark on the app's own origin is accepted even when its host has no dot (a development server), and the client opens it inside the app.

## Phase 4 · Slice VM: voice and video messages (spec 6.9)

A recording is an ordinary chat file with clip data beside `snippet`. Nothing else changes: the same upload steps, size
limit, scan, posting rights and `fileIds` on send.

| Field | Where | Shape | Notes |
|---|---|---|---|
| `clip` | `POST /api/files/upload-url` body (chat uploads only) | `{ kind: 'voice' \| 'video', durationMs, waveform }` | Leave it out for any other file; never with `snippet`. |
| `clip` | every `Attachment` | the same, or `null` | `null` for every file that isn't a recording. |

- **Formats:** voice `audio/webm`, `audio/mp4`, `audio/ogg`; video `video/webm`, `video/mp4` (the type before any `;codecs=`). Otherwise `400` "That recording’s format isn’t supported."
- **Length:** work it out from the file itself (for example with ffprobe at `complete`); never trust `durationMs` as sent. Voice up to 5 minutes and video up to 2, with 1 s of slack: otherwise `400` "Voice messages can be up to 5 minutes." / "Video messages can be up to 2 minutes." Store the length you measured.
- **Waveform:** voice exactly 48 numbers from 0 to 1; video `[]`. Keep it as sent once the shape passes; otherwise `400` "That recording can’t be added." (also for `clip` with `snippet`, a missing or zero length, or an unknown `kind`).
- **Title:** "Voice message" or "Video message".
- **Playback:** clients read the length from `clip.durationMs`, since a browser's WebM recording may not carry one; serve the bytes with `Accept-Ranges` so seeking works.
