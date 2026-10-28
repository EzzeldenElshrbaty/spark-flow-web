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
| `notifyLevel` | `"all" \| "mentions" \| "none"` | Mine only. Without a row: `"mentions"` for a channel, `"all"` for a DM. Set with `PATCH /api/channels/:id/me` `{ notifyLevel }` (Phase 2 slice 3). |
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

On reconnect the client expects missed `message.created` events replayed in `seq` order per channel (spec §8, transport rules).

## Phase 1 · Feature 2: channel header and tabs

No new routes. The header uses the ones above: the star toggle and Mute (under the bell since slice 3) call `PATCH /api/channels/:id/me`, and Mark all read calls `POST /api/channels/:id/read` with no `seq`. Leave and Archive use the existing channel routes; Channel details (slice 4, below) has its own. The tabs are client-side (`?tab=files|pins|page`); Files, Pins and Page get their own endpoints when they are built (Phases 3 and 4).

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

`POST /api/messages/:id/reactions` (and the reply equivalent) toggles the person's reaction with any single emoji (one grapheme, e.g. 👍🏽 or 🇪🇬) of at most 16 code points, made only of pictographs, flag letters, skin tones, U+FE0F, U+200D and the tag letters U+E0020–E007F (`isOneEmoji` in `src/lib/emojiText.ts`); anything else, such as an emoji stretched with combining marks, is `400` "Pick an emoji.". A message holds at most 50 different emoji: a new one past that is `400` "This message has 50 different reactions already." The client toggles optimistically and rolls back on an error, so the rule must match `toggleReaction` in `src/lib/reactions.ts`.

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

What a delete takes is kept only for the Undo window, then dropped (retention beyond that is OPEN item 8). The client asks before deleting a message with replies or files, and offers Undo either way.

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

`POST /api/messages/:id/replies` takes `{ content, body?, alsoInChannel? }`.
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
- Keywords, desktop, mobile and email delivery, and Do Not Disturb wait for Preferences.

### Activity item

| Field | Type | Rule |
|---|---|---|
| `id` | string | For a mention, the mention's id (the bell's); else the stored item's. |
| `kind` | `"mention" \| "reaction" \| "thread"` | |
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

- **Mentions** of me, as `GET /api/mentions` has them (spec 6.12 Mentions), in this workspace, worked out from each message or reply as it reads now (an edit can add or remove one; `@all` counts).
- **Reactions** to my messages and replies (spec §7 `Notification`): one item per person and emoji. Taking the reaction back removes the item; my own reactions make none, and neither do reactions in a channel I can no longer read.
- **Thread replies** in threads I follow (the following rules of slice 2): one item per reply, stored for every follower except the replier and anyone who can't read the channel. A reply that mentions me as it reads now is listed once, as the mention, not again as a thread item.
- Items whose message or reply is deleted are left out, as are channels at Nothing and channels I can no longer read (I left a private channel or was taken off it): the read check runs when the list is read, not only when an item is stored, since the excerpt is the text as it is now.
- Reading a message in its channel doesn't mark its Activity item read; opening the item (or Mark all read) does.

### Real-time event

| Client handler | Wire event | Payload |
|---|---|---|
| `onNotificationCreated` | `notification.created` | `{ userId }`, sent only to `userId`'s own connections: when a reaction or thread item is stored for them, and when a new message or reply mentions them (by name, or `@all` as a member), once per person per message. |

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
| Ask to upload | `POST /api/files/upload-url` | `{ channelId, name, size, mimeType }` | `{ file, uploadUrl }`: the record (`scanStatus: "pending"`) and a short-lived address for the bytes. |
| The bytes | `PUT <uploadUrl>` | The file's bytes, `Content-Type` its type | To object storage, not the API. The browser reports progress from this request. |
| Upload complete | `POST /api/files/:id/complete` | — | The file, once the server has sniffed its type, scanned it and made any thumbnail. |
| Send (changed) | `POST /api/channels/:id/messages` | `{ content, clientId?, body?, fileIds? }` | The message. |
| Reply (changed) | `POST /api/messages/:id/replies` | `{ content, body?, alsoInChannel?, fileIds? }` | The reply. |
| Open | `GET /api/files/:id` | — | The bytes, or a redirect to a short-lived signed address. |
| Details | `GET /api/files/:id/details` | — | `{ file, sharedIn: [{ channelId, messageId, replyId, at }], taskKeys, projectIds }`, as I may see them. |
| Edit file details | `PATCH /api/files/:id` | `{ title?, description? }` | The file. |
| Delete file | `DELETE /api/files/:id` | — | Nothing (`204`). |
| Share | `POST /api/files/:id/share` | `{ channelId, content? }` | The new message. |
| Remove from a project (moved) | `DELETE /api/projects/:projectId/files/:fileId` | — | Nothing. It was `DELETE /api/files/:id` with the project-file link's id; that path now means the file itself. |

Rules:

- **Upload:** whoever may post in the channel (`checkCanWrite`: a private channel's members, not while archived, and only Admins in an Only admins channel). The same file types as everywhere else (`fileTypes.ts`: PDF, images, video, office files, CSV, text, ZIP/RAR, AI, PSD, HEIC); others `400` "That type of file can't be added.". Empty: `400` "That file is empty.". The size limit is a server setting (1 GB suggested by the spec; the prototype keeps 25 MB), mirrored in the client by `VITE_MAX_FILE_MB` so the browser refuses the same files before uploading: `400` "Files can be up to N MB.". A file never sent is the uploader's only, and the server removes it after 24 hours.
- **Send and reply with files:** at most 10 (`400` "Attach up to 10 files to a message."); each must exist and not be deleted (`404`), be mine (`403` "You can only send files you uploaded."), and be clean (`400` "x is still being checked." / "x was blocked."). With files the text may be empty. A retried send with the same `clientId` still returns the first message.
- **Open and Details:** for whoever reads a channel the file is shared in, is on a project or task that has it, or uploaded it and hasn't sent it yet; anyone else gets `404`, so nobody learns it exists. Opening a blocked file: `400` "This file was blocked.".
- **Edit file details and Delete file:** whoever uploaded it, or an Admin (`403` "Only whoever uploaded it, or an admin, can change this file."; spec §9). Not while a project or channel it's in is archived (`400` "This project is archived. Restore it first." / "This channel is archived."). Name: `400` "Give the file a name." / "Keep the name under 250 characters."; description: `400` "Keep the description under 1,000 characters.". Delete keeps the record with `deletedAt` and throws the bytes away.
- **Share:** whoever uploaded it, or an Admin (`403` "Only whoever uploaded it, or an admin, can share this file."), so nobody else carries a file from a private channel into a wider one; into a channel I can post in (as sending); the file must be clean. It posts a new message with the file and my optional text.
- **Events:** sharing sends `message.created` for the new message and `file.shared`; Edit file details sends `file.updated`, and Delete file `file.deleted` (client handler `onFileChanged`, `{ fileId }`), plus `message.updated` for every message and reply that shows the file, and `files.changed` for any project that lists it. The client refreshes the file's details on `onFileChanged`.

Save for later, Add to folder and Add from Flow files come with the Saved view and the channel Files tab (Phase 3); Text snippet and code highlighting in Phase 3; voice and video messages in Phase 4.
