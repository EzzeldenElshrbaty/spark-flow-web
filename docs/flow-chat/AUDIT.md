# Flow chat audit against the approved spec

Date: 29 Oct 2026 · Branch: `feat/flow-chat` (local head 405f159, origin/dev 3b4d6eb) · Spec: `docs/flow-chat/FLOW_CHAT_REDESIGN.md` with `docs/flow-chat/design/*` · Read-only: no code was changed for this audit.

## How it was checked

- **Checklist:** one item per requirement and acceptance line in §3.1–3.3, 5.1–5.4, 6.1–6.16, 7, 8, 9, 10, 11 and the §12 ACs. Items aren't merged. 1223 items in all.
- **Statuses:** each item has a status, evidence (file:line, test or screenshot), the gap, a phase from §12 and an effort (S under an hour, M a few hours, L a day or more).
  - A recorded ruling in `tasks/todo.md` reads "Different from spec (approved ruling: …)" and isn't counted as a defect.
  - "Not started (later phase)" means Phase 3 or 4 with nothing built.
  - "Missing" means Phase 0–2 and not there.
- **Code reading:** seven read-only helpers, one per spec area, each reading the code against the spec, the reference CSS and the tokens. I re-checked their app-dependent items in the running app (below).
- **Tests:** `npx vitest run` passed 127 files, 1289 tests (unit and browser projects), plus `tsc`, lint and build clean at the last full run. The tests that cover the five areas asked about are listed under "Tests for the named areas".
- **Running app:** prototype build at http://localhost:5173, #backend and #general, 1440×900, light and dark. Screenshots are in `docs/flow-chat/audit/`:

  | File | Shows |
  |---|---|
  | 01-backend-light.jpg | #backend, light |
  | 11-backend-dark.jpg | #backend, dark |
  | 02-date-pill-doubled.png, 12-dark-first-frame-overlap.jpg | the sticky date pill drawn twice |
  | 03-hover-toolbar-light.jpg | hover toolbar |
  | 04-message-menu-light.jpg | message ⋯ menu |
  | 05-thread-panel-light.jpg | thread panel |
  | 06-emoji-picker-light.jpg | emoji picker |
  | 07-attach-menu-light.jpg | composer + menu |
  | 08-composer-action-row.png | composer action row |
  | 09-at-autocomplete-light.jpg | @ autocomplete |
  | 10-add-people-light.jpg | Add people |
  | 13-image-frame-wider-than-image-dark.jpg | image frame wider than the image |
  | 14-file-menu-dark.jpg | file card ⋯ menu |
  | 15-cmd-k-in-composer-light.jpg | ⌘K in the composer: the link row opened behind the global search |

  The / and Schedule menus can't be shot because neither exists (Phase 3).

## Summary per phase

| Phase | Done | Partial | Different (no ruling) | Different (approved ruling) | Missing | Not started (later phase) | OPEN | Total |
|---|---|---|---|---|---|---|---|---|
| 0 | 160 | 26 | 2 | 1 | 2 | 0 | 1 | 192 |
| 1 | 259 | 33 | 18 | 2 | 13 | 0 | 1 | 326 |
| 2 | 281 | 30 | 20 | 12 | 27 | 1 | 1 | 372 |
| 3 | 0 | 4 | 1 | 0 | 0 | 187 | 1 | 193 |
| 4 | 8 | 10 | 5 | 0 | 0 | 107 | 8 | 138 |
| n/a | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 2 |
| **All** | **708** | **103** | **46** | **15** | **42** | **296** | **13** | **1223** |

"n/a" covers rows the spec's §12 gives no phase.

Phase 0–2 is the current scope. Its open work comes to 171 items (Partial, Different without a ruling, and Missing). Most of Phase 3 and 4 is not started, as planned.

## The seven named gaps

| # | Gap as reported | Verdict | Evidence |
|---|---|---|---|
| 1 | Sticky date pill renders twice | **Confirmed.** | The list is flat, with an `aria-hidden` copy of the pill laid over it (`MessageList.tsx:336-341,404-411`) instead of sticky day sections. While a divider passes under the copy, two pills of the same day show for about 24px of scroll. The next day's pill never pushes the copy out; the copy just hides. With the unread bar open, the hide test still uses the 0–40px band. Screenshots 02, 11, 12. No test covers the sticky pill. Items 6.2-09, 6.2-10, 6.2-11, 6.2-12. |
| 2 | Composer row lacks video message, voice message, / shortcuts, the Shift+Enter hint, and split Send with Schedule | **Partly confirmed.** | Video and voice message are Phase 4. / shortcuts, split Send and the Schedule menu are Phase 3. All are Not started, with no placeholders (6.8-24 to 6.8-30, 6.8-36, 6.8-86 to 6.8-95, 6.8-107 to 6.8-112). **The Shift+Enter hint exists**, so that part isn't a gap. Shift+Enter itself works (`KeysPlugin.tsx:56-59`, `RichComposer.browser.test.tsx:65`). The row also differs in Phase 1 metrics: Send is 32×32 with an 18px icon (spec 28 high × 36 wide, 16px icon), + isn't the round `surface-hover` pill, the row padding is 4px (spec 8px right and bottom), and the formatting icons don't brighten on focus (6.8-20, 6.8-29, 6.8-31, 6.8-33). |
| 3 | Channel search button missing; Call is Phase 4 | **Confirmed. Both are Not started.** | Channel search and `in:#channel` scoping are Phase 3, and nothing is built. Call is Phase 4. Items 6.1-xx in B. ⌘F (search in channel) is Phase 3 too. |
| 4 | Tabs lack "+" and the Pins count | **Confirmed. Both are Not started (Phase 3).** | `Tabs` supports a count, but `ChannelTabs` passes none and there is no pin data. The tabs "+" (bookmarks) and its separator are Phase 3. Measured: the active tab's underline sits at `bottom: 0`, the reference has `-1px`. |
| 5 | Sidebar Chat group shows only Activity; Starred and Apps missing; check row states | **Partly confirmed.** | Threads, Drafts & sent and Saved exist (`Sidebar.tsx:305-320`) but sit behind the `chatRedesign` flag, which is off by default and forced off in production. With the flag on they link to routes that don't exist, so the page reads "not found". The views themselves are Phase 3. **Starred exists**: it shows once something is starred (`Sidebar.tsx:326-334`). Apps is Not started (Phase 3 with Flowbot, Phase 4 for apps). Row states are Done: unread bold, mention count, muted with bell-off and no count, draft pencil, active; the pencil was seen in the app. Two Phase 0 rows are Missing: the Channels options button and the "Add channels" row (5.1-19, 5.1-20). |
| 6 | Image frame wider than the image | **Confirmed in the app.** | A 1600×900 image renders at 420×236 inside a 571px frame, and 2000×300 renders at 420×63 inside a 1076px frame; 100×100 and 400×1600 fit. The cause: the 420px cap is a percentage max-width on the `<img>` (`max-w-[min(420px,100%)]`), which doesn't count when the `w-fit` wrapper and the frame button shrink to fit (`MessageFiles.tsx:219-221`). The file pill sits on the wrapper, so it floats off the image. Inline video uses the same wrapper (6.9-38). Screenshot 13. |
| 7 | Toolbar, menu, Remind me, reactions, thread panel with Also send, typing, New line and unread bar, Jump to latest, optimistic send with Retry, edit in place | **All exist except Remind me (Phase 3).** | One real bug: **the New line and the unread bar vanish after a tab round-trip.** In #general I opened the channel and the line showed; after Files, then Messages, it was gone. `PaneFeed` remounts and re-reads `lastReadSeq`, which opening already moved (`ChannelPage.tsx:126-131,363-364`; 6.2-33). Remind me and its submenu are Not started (Phase 3). Smaller differences: the thread panel uses the old CRM `InspectorFrame` chrome, has an inverted header hierarchy, and shows "N replies" in legacy tokens. The thread summary shows 3 avatars, where the spec has up to 5, and says "5d ago", with no "today at 9:41 AM" form. Typing text is `text-muted`, where the spec has `text-secondary`. |

## What I checked in the running app

The helpers couldn't run the app, so these results override their "[app check]" guesses:

- **Image frame (6.9-37):** confirmed; the numbers are under gap 6.
- **New line after switching tabs (6.2-33):** confirmed; the steps are under gap 7.
- **Sticky date pill (6.2-12):** confirmed; see screenshots 02, 11 and 12.
- **Modal focus trap (6.10-09):**
  - Tab and Shift+Tab cycle inside "Delete message?": Cancel → Delete message → Close → Cancel.
  - After a click on the scrim, focus sits on `body`, but the next Tab goes back into the dialog. It does not reach the page behind, so the helper's worst case doesn't happen. The gap is only that focus parks on `body`.
- **⌘K inside the composer:** **new finding, broken.**
  - I typed "abc", selected it and pressed ⌘K. Two things happened at once: the composer's link row opened, and global search opened and took focus.
  - After Esc closes the search, the link row is still open and focus is on `body`.
  - The cause: `GlobalSearch.tsx:213-215` listens on the window and doesn't skip a key the editor already handled (`defaultPrevented`) or one that comes from inside a text box.
  - Screenshot 15.
- **Restoring focus after a delete:** **new finding.** After Delete message, focus lands on `body`, because the row that opened the menu is gone. §10 asks menus and modals to restore focus. Focus should move to the next row or the composer.
- **Focus ring:** confirmed. The computed value on a tab in dark is `0 0 0 2px #121214, 0 0 0 4px #f2453d`, matching `--focus-ring`.
- **Count badge:** confirmed. `Count` in `components/sf/Badge.tsx:7-19` matches `.sf-count`: 18px high, min-width 20, 4px padding, full radius, 600 12/18.
- **Icon-only buttons:** 92 are visible in #general, and all have an accessible name. Tooltips weren't checked one by one.
- **Message row, avatar, composer border and radius, toolbar shadow, date pill:** checked earlier in this audit; they match the reference CSS. Two exceptions are the tab underline offset (above) and the thread panel, which is 384px by approved ruling and uses the legacy InspectorFrame header.

### Shortcuts (§10), tested with real key presses

| Shortcut | Result |
|---|---|
| ⌘K | Done outside a text box: global search opens with focus in the input. Broken inside the composer, where it also opens the link row (above). |
| Alt+↓ / Alt+↑ | Done. #backend → #frontend-dev → #backend (`channelKeys.ts`). |
| Up in an empty composer | Done. Opens my last message in the rich edit box. |
| U on a focused message | Done. Marks it unread, and the New line appears. |
| T / E / L on a focused message | Done in code (`ChannelMessage.tsx:219-238`), with tests. |
| P / S on a focused message | Not started: pinning and saving don't exist. |
| Esc / Shift+Esc | Built (`channelKeys.ts:33`), with tests. |
| ⌘⇧A | **Missing.** Nothing happens and there's no handler, although Activity exists. |
| ⌘⇧T | Not started (Threads view, Phase 3). |
| ⌘F | Not started (search in channel, Phase 3). |

## Tests for the named areas

| Area | Covered? | Tests |
|---|---|---|
| Message grouping | Yes | `pages/chat/messageRows.test.ts` "canContinue (spec 6.2 grouping rule)": 8 tests, including 10:05:00 groups and 10:05:01 doesn't, another author, a new day, thread replies, cards, system messages. Also "buildRows" and `ChannelMessage.test.tsx:153`. |
| Unread "New" line | Yes, except the bug in gap 7 | `messageRows.test.ts`: the New line goes before the first message from someone else after my marker, not before system messages, and not while older pages are unloaded. `readState.test.tsx` (14 tests), `markRead.test.ts`, `MessageList.browser.test.tsx:234-314` (open at the New line, unread bar, read hold after U). No test switches tabs and comes back. |
| Mention parsing | Yes | `lib/mentions.test.ts` ("parseMentions", "segments"), `lib/messageBody.test.ts:39,117`, `lib/mentionQuery.test.ts`, `composer/bodyEditor.test.ts:38`. |
| Task-key parsing | Yes | `lib/mentions.test.ts` ("parseTicketKeys": order, lowercase, single letters, over-long and glued keys), `lib/messageBody.test.ts:58`, `mocks/chat.test.ts:187`, `composer/bodyEditor.test.ts:65`. Gap: `mentions.ts` and `messageBody.ts` use two different key patterns, and nothing tests "only keys of projects the viewer can see". |
| Composer markdown autoformat | Partly | Only `RichComposer.browser.test.tsx:97` (`*bold*`, `_italic_`, `~strike~`, `` `code` ``) and `:118` (`- ` lists). The `:118` title says quote but only asserts the list. Nothing asserts `> `, `1. ` or the code fence, and `composer/markdown.ts` has no unit test. |

Keyboard and focus are also covered by `useChannelKeys.test.tsx`, `useChannelKeys.browser.test.tsx`, `channelKeys.test.ts`, `ChannelShortcuts.test.tsx`, `components/sf/layers.test.tsx` (trap, restore, Esc stack), `a11y.browser.test.tsx` (axe in both themes, 44px targets) and `styles/flowTokens.test.ts` (contrast). There's no CI pipeline in the repo, so contrast and axe only run with `npm test`. There are no end-to-end tests, and the §11 targets (delivery under 200 ms, 60 fps at 10,000 messages, channel switch under 300 ms) aren't measured.

## Fix first: the 15 highest-impact gaps

Phase 0–2 only. Broken behaviour and visible mismatches on the main channel screen come first, then correctness, then the rest.

| # | Gap | Items | Phase | Effort | Why it ranks here |
|---|---|---|---|---|---|
| 1 | The New line and unread bar vanish after switching tabs and back | 6.2-33, 6.2-32 | 1 | S | Broken. Someone loses their place in a busy channel after one look at Files. Confirmed in the app. |
| 2 | Sticky date pill drawn twice, and it doesn't push the next one | 6.2-09, 6.2-11, 6.2-12 | 1 | M | Visible on every scroll of the main screen. Confirmed. |
| 3 | ⌘K in the composer opens the link row and global search together | §10, 6.8 keys | 1 | S | Broken. ⌘K is the usual link shortcut, and focus ends up on `body`. Confirmed (screenshot 15). |
| 4 | Image and video frame wider than the media; the pill floats off it | 6.9-37, 6.9-38 | 2 | S | Visible on every wide image. Confirmed. |
| 5 | Task chips resolve every task for every viewer | 9-05, 9-23, 8-45 | 1 | S | A data leak in the contract the backend copies: someone sees titles, status and assignee of tasks they may not open. |
| 6 | Main card painted `bg-canvas` instead of `surface` | 5.3-02, 3.2-08 | 0 | S | The whole main pane sits on the wrong colour. |
| 7 | Composer metrics | 6.8-29, 6.8-20, 6.8-31, 6.8-33, 6.8-68, 6.8-17 | 1 | S | Biggest control on the screen. Send size, + pill, row padding, icon focus colour, typing colour and the 50vh cap differ. |
| 8 | Thread panel chrome is the old CRM `InspectorFrame` | 6.7-10, 6.7-11, 6.7-18, 6.7-20 | 2 | M | "Thread" title with a "#channel" subline, `sf-panel` header and borders, "N replies" divider. The width stays 384px by ruling. |
| 9 | Thread summary under a message | 6.7-02, 6.7-05, 6.7-06 | 2 | S | Should show up to 5 avatars, "5 days ago" and "today at 9:41 AM". On every threaded message. |
| 10 | Tab underlines and message row details | 6.6-23, 6.3-40, 6.3-05 | 1–2 | S | Emoji picker tabs have no 2px accent bar, and the channel tab bar sits at 0 where the reference has -1px. "(edited)" sits on its own line instead of inline (code reading, needs an app check). The time tooltip is a native `title`, not the sf Tooltip. |
| 11 | Focus after a delete and after a scrim click | 6.10-09, §10 | 0 | S | Keyboard and screen-reader users lose their place. |
| 12 | Writes that aren't idempotent | 8-10, 8-78, 8-13, 8-14 | 1–2 | M | A retried reply stores twice, since it has no client id. A retried reaction flips back, since it's a toggle POST rather than PUT and DELETE. |
| 13 | Mentions | 6.8-76, 6.8-77, 6.8-78, 7-49, 7-50 | 1 | M | `@channel` (built as `@all`) and `@here` are wrong or missing, and there's no confirm before notifying more than 25 people. |
| 14 | Shell menus and panels still in Spark CRM styling with lucide icons | 3.1-09, 3.1-16, 3.3-35, 3.3-39 | 0 | M | Account, workspace and notification menus, the search results panel and the inspector frame. Visible on every screen. |
| 15 | Sidebar and shortcut gaps | 5.1-19, 5.1-20, §10 ⌘⇧A | 0 | S | Channels options button, "Add channels" row, and ⌘⇧A for Activity. The options list needs a decision: the spec doesn't name the options. |

Close behind these: unit tests for composer autoformat (`> `, `1. `, the code fence); 9 icon-only buttons with a name but no tooltip (Send, the tray ×, the panel Close, and six `tooltip={false}`); `can()` isn't the only rule table for message edit and delete (9-15, 9-17); invite-on-send for "Not in this channel" (6.8-75); the ⋮ menu lacks Notification settings and offers Archive to every member (6.1-15, 6.1-17); the Activity header end padding is 12px, the spec has 16px (6.12-01); and the `chatRedesign` flag rows link to routes that don't exist (5.1-11, 5.1-13, 5.1-15).

## Fix plan, in small batches

Each batch is test first, then a report. Nothing is pushed until you say so. The batches are ordered like the list above and touch separate files, so each can land on its own.

| Batch | Fixes | Files | Tests (written first) |
|---|---|---|---|
| A. Read position | #1 | `pages/chat/ChannelPage.tsx`: take the read marker once per channel visit, above the tabs, and hand it to `PaneFeed` so a remount doesn't re-read it. `MessageList.tsx`: give the New line a 24px inset. | `ChannelPage.test.tsx`: Files → Messages keeps the New line and the unread bar. `MessageList.test.tsx`: the inset. |
| B. Sticky date pill | #2 | `pages/chat/MessageList.tsx`: hide the in-flow pill that sits under the overlay, and push the overlay up by the next divider's offset, using the bar offset rather than a fixed 0–40px band. | `MessageList.browser.test.tsx`, new: one pill at a time while scrolling across a day boundary; the next day's pill pushes the sticky one out; the same with the unread bar open. |
| C. ⌘K in the composer | #3 | `layout/GlobalSearch.tsx:213-215`: skip a key already handled (`defaultPrevented`) or one from inside a text box or editor. `composer/KeysPlugin.tsx`: mark ⌘K handled. | `RichComposer.browser.test.tsx` with real keys: ⌘K in the composer opens only the link row and keeps focus in it; ⌘K on the page still opens search. |
| D. Media frame | #4 | `pages/chat/MessageFiles.tsx`: put the 420px cap on the frame, make the img and video `max-w-full h-auto`, and review `max-h-80`. | `MessageFiles.browser.test.tsx`, new: the frame width equals the media width for 1600×900, 2000×300, 400×1600 and 100×100, and the pill stays inside the image. |
| E. Task privacy | #5 | `mocks/tickets.ts` (filter `resolve` by the viewer); `lib/permissions.ts` (add `task.view`); `docs/flow-chat/api-contract.md`. | `tickets.test.ts`: someone outside a private project gets no chip data for its tasks. `permissions.test.ts`. `MessageBody.test.tsx`: an unseen task renders as plain text. |
| F. Main card and composer | #6, #7 | `layout/AppLayout.tsx` (card on `bg-sf-surface`; check the non-chat pages that assume canvas); `pages/chat/composer/RichComposer.tsx`, `FormatBar.tsx`, `components/sf/Button.tsx` (send size), the typing line. | `RichComposer.browser.test.tsx`: computed sizes of Send (28×36, 16px icon), the + pill, row padding, icon colour on focus, max height 50vh. `AppLayout.test.tsx`. |
| G. Thread panel and summary | #8, #9 | `pages/chat/ThreadInspector.tsx` and a `sf` panel header in place of `InspectorFrame` for the thread; the thread summary in `MessageParts.tsx`; `lib/format.ts` (`lastReplyText`: "today at 9:41 AM", "5 days ago"). | `ThreadInspector.test.tsx`: title, subline, divider. `MessageParts.test.tsx`: 5 avatars. `format.test.ts`: the copy. |
| H. Tabs, picker, row details | #10 | `components/sf/Tabs.tsx` (-1px), `pages/chat/EmojiPicker.tsx` (accent bar), `pages/chat/ChannelMessage.tsx` and `MessageBody.tsx` (inline "(edited)", sf Tooltip on the time). | `Tabs.test.tsx`, `EmojiPicker.test.tsx`, `ChannelMessage.test.tsx`, plus a browser check that "(edited)" is on the last line. |
| I. Focus | #11 | `components/sf/layers.tsx` / `Modal.tsx` (a scrim click keeps focus in the panel); `pages/chat/MessageActions.tsx` (after a delete, focus the next row or the composer). | `Modal.test.tsx`; `a11y.browser.test.tsx` with real key presses: delete via the menu, then focus is on the next row. |
| J. Idempotent writes | #12 | `api/types.ts`, `lib/http.ts`, `mocks/chat.ts`, `api/chat.ts`: a client id on replies; reactions as `PUT` and `DELETE /messages/:id/reactions/:emoji`; contract. | `chat.test.ts`: a retried reply stores once, and a retried PUT stays added. `http.test.ts`: the routes. |
| K. Mentions | #13 | `lib/mentions.ts` (`@channel` with `@all` kept as an alias, `@here`), the composer autocomplete, a confirm `Modal` above 25 members, `mocks/chat.ts` (notify active people for `@here`), contract. | `mentions.test.ts`, `RichComposer.browser.test.tsx` (confirm shown at 26, not at 25), `chat.test.ts`. |
| L. Shell styling | #14 | `layout/UserMenu.tsx`, `NotificationsMenu.tsx`, `WorkspaceSwitcher.tsx`, `GlobalSearch.tsx` (results panel), `InspectorFrame.tsx`: `sf` Menu, Icon, radii, shadows, easing. | Existing tests updated for the `sf` Menu roles; `a11y.browser.test.tsx` axe in both themes. |
| M. Sidebar and ⌘⇧A | #15 | `layout/Sidebar.tsx` ("Add channels" row; the options button once its options are agreed); a global key in the layout for ⌘/Ctrl+Shift+A. | `Sidebar.test.tsx`; a browser key test for ⌘⇧A that doesn't fire while typing. |

## Decisions needed from you

These items can't be fixed without a call from you:

1. **Forward, Save for later, Pin to channel, the Custom emoji tab and skin tone.** §12 puts them in Phase 2 ("all items except Remind"), but Save and Pin need Phase 3 data (Saved, Pins tab), and Forward has no flow in the spec. Should they move to Phase 3, or get a short design now?
2. **Enter on a touch screen** makes a new line. No ruling is recorded for it. Keep it, and record the ruling?
3. **Guest and External tags, channel member roles, a linked project on any channel, member invites.** These need data-model work, and External isn't defined in the spec. Should they go in the guests slice?
4. **Notification delivery** (desktop, push, email digest), Do Not Disturb and the global default. §12 gives them no phase. Should they move to Preferences (Phase 3)?
5. **The `chatRedesign` flag rows.** Hide them until the Phase 3 views exist, or point them at "Coming soon" pages?
6. **The backend socket client (SignalR).** With the backend on, no live event arrives (8-81). This needs the .NET hub contract first; it's an L, and it's for the backend team as much as for us.

## Full checklist

Each helper's table follows, with the helper's notes. "[app: …]" marks an item I re-checked in the running app.


### Audit A: Foundations and shell (FLOW_CHAT_REDESIGN.md §3.1, §3.2, §3.3, §5.1, §5.2, §5.3, §5.4)

Repo: /Users/ezzelden/Work/ezz/WORK/Spark/DEV/Spark_Flow/spark-flow-web. Read-only audit. The repo is not a git repository, so no diffs were used. Evidence paths are relative to the repo root; "css" means `src/styles/flow-tokens.css`, "index" means `src/index.css`. The unit tests `src/styles/flowTokens.test.ts`, `src/layout/SideLink.test.tsx` and `src/layout/SidebarResizer.test.tsx` were run (15/15 pass).

| ID | Section | Requirement | Status | Evidence | Gap | Phase | Effort |
|---|---|---|---|---|---|---|---|
| 3.1-01 | 3.1 | Add `spark-flow-tokens.css` to the global stylesheet | Done | `src/index.css:3` imports `./styles/flow-tokens.css`; `src/styles/flowTokens.test.ts` checks every colour token of `spark-flow-tokens.json` against it, light and dark | | 0 | — |
| 3.1-02 | 3.1 | Light is the default on `:root` | Different from spec (approved ruling: tokens are scoped to the `.sf` class so other modules keep their own tokens, CLAUDE.md "Flow chat redesign → Scope") | `css:7` `.sf {…}` (light) and `css:81`, `css:112`; header comment `css:1-6` | Values are identical to the design file but live on `.sf`, not `:root`. Anything outside a `.sf` element has no chat tokens. | 0 | — |
| 3.1-03 | 3.1 | `[data-theme="dark"]` on any container switches it to dark | Partial | `css:58-59` `.dark .sf, [data-theme='dark'] .sf`; `src/lib/ThemeProvider.tsx:22-25` sets `class="dark"` and `data-theme` on `<html>` | [app check] Dark only applies when the dark marker is on an ancestor of `.sf`. `data-theme="dark"` on the `.sf` element itself, or on one container inside a light page, does not match. The design file's `[data-theme="light"]` selector (to force light inside dark) is not carried over. | 0 | S |
| 3.1-04 | 3.1 | Extend the Tailwind theme with the CSS variables (colours), every token | Partial | `index:251-290` maps all 25 colour roles plus `success`, `warning`, `on-warning`, `error`, `white`, `red-400` and ink 50/100/300/400/600/700/800/950 to `--color-sf-*` | Palette primitives `red-600`, `red-700`, `red-50`, `ink-200`, `ink-500`, `ink-900` have no `sf-` utility. They are only reachable through `var(--…)`. | 0 | S |
| 3.1-05 | 3.1 | Map `spacing` the same way (4, 8, 12, 16, 24, 32, 48, 64; "nothing in between") | Partial | `css:82-89` defines `--space-1…16`. `index:298-306` maps only the `--size-*` tokens (`--spacing-sf-control` etc.). | `--space-*` is not mapped in `@theme`; code uses Tailwind's default scale. The values coincide at p-1/2/3/4/6/8/12/16, but in-between steps (0.5, 1.5, 2.5, 5, 7, 9, 10, 11) are used about 72 times in `src/layout`, `src/components/sf`, `src/pages/chat` (mostly in `UserMenu.tsx`, `ChannelSheet.tsx`, `GlobalSearch.tsx`, `NotificationsMenu.tsx`). `Sidebar.tsx` uses h-11 for the 44px touch row. | 0 | S |
| 3.1-06 | 3.1 | Map `borderRadius` | Done | `index:291-294` `--radius-sf-sm/md/lg/full`; used as `rounded-sf-*` throughout `src/components/sf/*` | | 0 | — |
| 3.1-07 | 3.1 | Map `boxShadow` | Done | `index:295-297` `shadow-sf-toolbar/menu/modal`; `sf-focus` utility `index:368-373` uses `--focus-ring` | | 0 | — |
| 3.1-08 | 3.1 | Map `zIndex` | Partial | `css:103-107` defines `--z-sticky/toolbar/menu/modal/toast`; used as `z-[var(--z-menu)]` in `Menu.tsx:221`, `Popover.tsx:104`, `Modal.tsx:58`, `Toast.tsx:42`, `MessageToolbar.tsx:206` | Not mapped in `@theme` (no `z-sf-*` utility). The shell uses Tailwind's defaults: `TopBar.tsx:24` z-20, `MobileNav.tsx:56` z-30 and `:83` z-40, `InspectorFrame.tsx:34` z-40, `GlobalSearch.tsx:276` z-50. | 0 | S |
| 3.1-09 | 3.1 | "Don't reuse Tailwind's defaults": shell uses the `sf-` tokens | Partial | Sidebar, top bar, search box, bell, profile button are all `sf-`. Legacy classes remain in `UserMenu.tsx:90-166` (legacy `MenuPanel`, `rounded-lg`, `text-xs`, `size-10 bg-ink-800`), `NotificationsMenu.tsx:65-130`, `WorkspaceSwitcher.tsx:23,37,56` (`roundButtonClass`), `GlobalSearch.tsx:276` (`rounded-xl shadow-xl`) and `:320-361` (phone search screen), `MobileNav.tsx:56` (bottom bar), `InspectorFrame.tsx:34` (`rounded-2xl shadow-lg`) | The shell's dropdown panels, phone search, bottom bar and inspector frame still use the Spark CRM tokens and Tailwind radii/shadows rather than `rounded-sf-*`, `shadow-sf-menu` and the `sf` `Menu`. | 0 | M |
| 3.1-10 | 3.1 | Font: Readex Pro, self-hosted (`@fontsource-variable/readex-pro`) | Done | `package.json:19`; `index:2` imports it; `css:108` `--font-sans: "Readex Pro Variable", "Readex Pro", system-ui…`; `css:112-115` `.sf { font-family }` | | 0 | — |
| 3.1-11 | 3.1 | Weights 300, 400, 500, 600 | Done | Variable font (`node_modules/@fontsource-variable/readex-pro/index.css` declares `font-weight: 160 700`); weights used in `sf` code are 400/500/600 | The variable file also spans 160–700, so nothing but convention keeps other weights out. | 0 | — |
| 3.1-12 | 3.1 | Latin and Arabic subsets | Done | `@fontsource-variable/readex-pro/index.css` ships arabic, vietnamese, latin-ext and latin `@font-face` blocks (unicode-range split) | | 0 | — |
| 3.1-13 | 3.1 | Never use weight 700 | Done | No `font-bold`, `font-extrabold`, `font-black` or `font-[7xx]` in `src/layout`, `src/components/sf`, `src/pages/chat` (grep) | | 0 | — |
| 3.1-14 | 3.1 | Icons: Tabler outline, `stroke={1.5}` via `@tabler/icons-react` | Done | `src/components/sf/Icon.tsx:8-28` fixes `stroke={1.5}`; `package.json:29`; sidebar, top bar controls and channel header use it | | 0 | — |
| 3.1-15 | 3.1 | Icon sizes: 20 default, 18 in dense rows, 16 in chips | Partial | `Icon.tsx:4-12` (`14\|16\|18\|20`, default 20); sidebar rows 18 (`Sidebar.tsx:123`); section chevron 14 (`Sidebar.tsx:200`); `IconButton` 20/18/16 (`Button.tsx:108`) | `Tag` icon is 14px (`Badge.tsx:40`), spec says 16px in chips. The wrapper adds an unspecified 14px size. | 0 | S |
| 3.1-16 | 3.1 | Tabler everywhere in the shell (lucide only outside chat/shell) | Partial | Lucide imports remain in shell files: `UserMenu.tsx:4`, `NotificationsMenu.tsx:3`, `WorkspaceSwitcher.tsx:2`, `MobileNav.tsx:2`, `InspectorFrame.tsx:1`, `TimerBar.tsx`, `GlobalSearch.tsx:2` (result icons, phone search), `searchShortcuts.ts`, `navigation.ts`; old `pages/chat/Composer.tsx:3` | Mobile bottom nav, account/workspace menus, notification row icon, search results and the inspector close button are still lucide at its own stroke. | 0 | M |
| 3.1-17 | 3.1 | Emoji uses the native font stack, only for content and reactions | Done | `index:376-379` `sf-emoji` (Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji); used in `MessageParts.tsx:104`, `MessageToolbar.tsx:274`, `EmojiPicker.tsx:187`; no emoji glyphs as UI icons in the shell | | 0 | — |
| 3.2-01 | 3.2 | `app-frame` #121214 light / #0a0a0b dark; sidebar and the frame around the main card | Done | `css:28` and `css:60` (ink-900 / ink-950); `index:252`; `Sidebar.tsx:516` `bg-sf-app-frame`; frame behind the card `AppLayout.tsx:34` | | 0 | — |
| 3.2-02 | 3.2 | `sidebar-hover` #1c1c1f both themes; hovered sidebar rows | Done | `css:29` (ink-800); `index:253`; `Sidebar.tsx:107` `hover:bg-sf-sidebar-hover` | | 0 | — |
| 3.2-03 | 3.2 | `sidebar-active` #2a2a2e both themes; current channel or DM | Done | `css:30` (ink-700); `index:254`; `Sidebar.tsx:105` | | 0 | — |
| 3.2-04 | 3.2 | `sidebar-text` #b4b4bb both themes; read rows | Done | `css:31` (ink-300); `index:255`; `Sidebar.tsx:108` | | 0 | — |
| 3.2-05 | 3.2 | `sidebar-text-strong` #ffffff both themes; unread rows (600), active row | Done | `css:32`; `index:256`; `Sidebar.tsx:105,108,110` | | 0 | — |
| 3.2-06 | 3.2 | `sidebar-text-muted` #8a8a93 both themes; section labels, muted channels | Done | `css:33` (ink-400); `index:257`; `Sidebar.tsx:108` (muted rows), `:189` (section labels) | | 0 | — |
| 3.2-07 | 3.2 | `sidebar-accent` #f2453d both themes; active row icon | Done | `css:34` (red-400); `index:258`; `Sidebar.tsx:125` active icon; resizer focus `Sidebar.tsx:506` | | 0 | — |
| 3.2-08 | 3.2 | `surface` #ffffff / #121214; main pane, panels, composer | Partial | `css:35`, `css:61` (white / ink-900); `index:259`; composer `RichComposer.tsx:287`, top bar `TopBar.tsx:24`, channel header `ChannelPage.tsx:230`, Activity `ActivityView.tsx:91` | Token is right, but the main card itself is painted with the legacy `bg-canvas` (see 5.3-02), so the main pane is not on `surface`. | 0 | S |
| 3.2-09 | 3.2 | `surface-hover` #f7f7f8 / #1c1c1f; hovered rows and menu items | Done | `css:36`, `css:62`; `index:260`; `Menu.tsx:235` items, `Button.tsx:9`, `ChannelMessage.tsx:210` | | 0 | — |
| 3.2-10 | 3.2 | `surface-raised` #ffffff / #1c1c1f; menus, toolbar, modals | Done | `css:37`, `css:63`; `index:261`; `Menu.tsx:221`, `Modal.tsx:68`, `MessageToolbar.tsx:206` | | 0 | — |
| 3.2-11 | 3.2 | `surface-sunken` #f7f7f8 / #0a0a0b; code, file icons, trays, search input | Done | `css:38`, `css:64`; `index:262`; search input `GlobalSearch.tsx:253`, inline code `MessageBody.tsx:95`, `Kbd` `Badge.tsx:54` | | 0 | — |
| 3.2-12 | 3.2 | `surface-selected` #fef3dc / #2a2110; thread-open or jump target, fades after 2s | Done | `css:39`, `css:65`; `index:263`; `ChannelMessage.tsx:210` and `:241` (600ms transition); `MessageList.tsx:28` `SELECTED_MS = 2000` | | 0 | — |
| 3.2-13 | 3.2 | `surface-mention` #fbeaea / #2b1415; mention rows, viewer's own reaction chips | Done | `css:40`, `css:66`; `index:264`; `ChannelMessage.tsx:210`, `MessageParts.tsx:110`, `MessageBody.tsx:25` | | 0 | — |
| 3.2-14 | 3.2 | `line` #d4d4d9 / #2a2a2e; hairlines and dividers | Done | `css:41`, `css:67`; `index:265`; `TopBar.tsx:24` border | | 0 | — |
| 3.2-15 | 3.2 | `line-strong` #8a8a93 / #6e6e76; borders of inputs, composer, outlined buttons | Done | `css:42`, `css:68`; `index:266`; `Button.tsx:9`, `RichComposer.tsx:288` | | 0 | — |
| 3.2-16 | 3.2 | `text` #0a0a0b / #ededef; content | Done | `css:43`, `css:69`; `index:267` | | 0 | — |
| 3.2-17 | 3.2 | `text-secondary` #4a4a51 / #b4b4bb; topic, descriptions, system messages | Done | `css:44`, `css:70`; `index:268`; `ChannelHeader.tsx:84-86` topic | | 0 | — |
| 3.2-18 | 3.2 | `text-muted` #6e6e76 / #8a8a93; timestamps, placeholders, counts | Done | `css:45`, `css:71`; `index:269`; `GlobalSearch.tsx:253` placeholder | | 0 | — |
| 3.2-19 | 3.2 | `accent` #b72427 / #f2453d; red as text (links, "N replies", mention pills, destructive) | Done | `css:46`, `css:72`; `index:270`; `MessageBody.tsx:25`, `MessageParts.tsx:197` | | 0 | — |
| 3.2-20 | 3.2 | `accent-fill` #b72427 both; red fill (primary button, Send, count badges, active tab rule) | Done | `css:47`; `index:271`; `Button.tsx:11`, `Badge.tsx:11`, `NotificationsMenu.tsx:61` | | 0 | — |
| 3.2-21 | 3.2 | `accent-fill-hover` #931c1f both; hover and pressed | Done | `css:48` (red-700); `index:272`; `Button.tsx:11-13` | | 0 | — |
| 3.2-22 | 3.2 | `on-accent` #ffffff both; text on `accent-fill` | Done | `css:49`; `index:273`; `Button.tsx:11`, `Badge.tsx:11` | | 0 | — |
| 3.2-23 | 3.2 | `presence-active` #15803d both; active presence dot | Done | `css:50` (success); `index:274`; `Avatar.tsx:85` | | 0 | — |
| 3.2-24 | 3.2 | `focus` #b72427 / #f2453d; focus ring colour | Done | `css:51`, `css:74`; `index:275`; ring itself `css:56`, `css:79` and `sf-focus` `index:368-373`; input border `GlobalSearch.tsx:253` | | 0 | — |
| 3.2-25 | 3.2 | `overlay` rgba(10,10,11,.5) / rgba(0,0,0,.64); modal scrim | Done | `css:52`, `css:75`; `index:276`; `Modal.tsx:58`, `MobileNav.tsx:84`, `Menu.tsx:210`, `Popover.tsx:95`; `flowTokens.test.ts:66-69` | | 0 | — |
| 3.2-26 | 3.2 | Text pairs meet 4.5:1 and control borders/icons 3:1, both themes | Done | `src/styles/flowTokens.test.ts:71-97` (text, secondary, muted, accent, error, on-accent, three sidebar texts; line-strong, focus, sidebar-accent, presence); test run: pass | The test covers the named pairs, not every pair in the app. | 0 | — |
| 3.2-27 | 3.2 | Keep red under about 10% of any screen | Done | [app check] Red is used for count badges, the one primary button, the bell dot and the active-tab rule (`Badge.tsx:11`, `Button.tsx:11`, `NotificationsMenu.tsx:61`) | Design guidance; cannot be measured from code. | 0 | — |
| 3.3-01 | 3.3 | Type `display` 28/36/600, -0.01em (channel intro) | Done | `index:312-315` `sf-display` | Only used in `src/pages/dev/UiGallery.tsx:111`; the channel intro (6.2) that uses it is not in `src/pages/chat`. | 0 | — |
| 3.3-02 | 3.3 | Type `title` 20/28/600 (modals, full views) | Done | `index:317-319`; `Modal.tsx:72` | | 0 | — |
| 3.3-03 | 3.3 | Type `heading` 16/24/600 (channel name, panel titles) | Done | `index:321-323`; `ChannelHeader.tsx:75` | | 0 | — |
| 3.3-04 | 3.3 | Type `body` 14/22/400 (messages) | Done | `index:325-327` | | 0 | — |
| 3.3-05 | 3.3 | Type `body-strong` 14/22/600 (author names, unread rows) | Done | `index:329-331`; `MessageParts.tsx:33`; unread sidebar rows use 14/20/600 through `Sidebar.tsx:102,110` | | 0 | — |
| 3.3-06 | 3.3 | Type `ui` 14/20/400 (rows, menus, inputs) | Done | `index:333-335`; sidebar rows use `text-[14px]/[20px]` (`Sidebar.tsx:102`), same values | | 0 | — |
| 3.3-07 | 3.3 | Type `ui-medium` 14/20/500 (buttons, tabs) | Done | `index:337-339`; `Button.tsx:35`, `UserMenu.tsx:74` | | 0 | — |
| 3.3-08 | 3.3 | Type `small` 13/18/400 (thread summary, helpers, typing line) | Done | `index:341-343` | | 0 | — |
| 3.3-09 | 3.3 | Type `meta` 12/16/400 (timestamps; the minimum size) | Done | `index:345-347`; `UserMenu.tsx:75`, `Sidebar.tsx:155` | | 0 | — |
| 3.3-10 | 3.3 | Type `label` 12/16/500, +0.12em, uppercase (section labels) | Done | `index:349-353`; `Sidebar.tsx:195`, `Logo` `Sidebar.tsx:427` | | 0 | — |
| 3.3-11 | 3.3 | Type `code` 13/20 system mono (code and task keys) | Done | `index:363-365`; `--font-mono` `css:109`; `MessageBody.tsx:95` | | 0 | — |
| 3.3-12 | 3.3 | Type `body-ar` 14/26, never letter-spaced (Arabic body) | Partial | `index:355-357` defines it (no letter-spacing) | Used only in `UiGallery.tsx:121`. Nothing applies it to Arabic message text (`html lang="en" dir="ltr"`, `index.html:2`). The RTL pass is Phase 4. | 4 | M |
| 3.3-13 | 3.3 | Type `heading-ar` 16/22, never letter-spaced (Arabic headings) | Partial | `index:359-361` defines it | Not applied anywhere outside the gallery (same as 3.3-12). | 4 | M |
| 3.3-14 | 3.3 | Spacing 4, 8, 12, 16, 24, 32, 48, 64 as `--space-1…16`; nothing in between | Partial | `css:82-89` tokens present and identical | Tokens exist but are not mapped or enforced; see 3.1-05 for the in-between values in use. | 0 | S |
| 3.3-15 | 3.3 | Radius `--radius-sm` 4 (inline code, kbd, 20px avatars) | Done | `css:90`; `Badge.tsx:51` kbd, `Avatar.tsx:5`, `MessageBody.tsx:95` | | 0 | — |
| 3.3-16 | 3.3 | Radius `--radius-md` 6 (controls, rows, 36px avatars) | Done | `css:91`; `Button.tsx:33`, `Sidebar.tsx:102`, `Avatar.tsx:7` | | 0 | — |
| 3.3-17 | 3.3 | Radius `--radius-lg` 12 (main card, composer, menus, modals, cards, toolbar) | Done | `css:92`; composer `RichComposer.tsx:287`, menus `Menu.tsx:224`, modal `Modal.tsx:68`, toolbar `MessageToolbar.tsx:206`; main card `AppLayout.tsx:40` uses a literal `lg:rounded-[12px]` (same value) | | 0 | — |
| 3.3-18 | 3.3 | Radius `--radius-full` (dots, badges, reaction chips, date pill) | Done | `css:93`; `Badge.tsx:11`, `MessageList.tsx:485` date pill, `MessageParts.tsx` chips | | 0 | — |
| 3.3-19 | 3.3 | Shadow `--shadow-toolbar` (message toolbar, date pill) | Done | `css:53`, `css:76`; `MessageToolbar.tsx:206`, `MessageList.tsx:485` | | 0 | — |
| 3.3-20 | 3.3 | Shadow `--shadow-menu` (menus, pickers, autocomplete, toasts) | Done | `css:54`, `css:77`; `Menu.tsx:221`, `Popover.tsx:104`, `AutocompletePlugin.tsx:124`, `Toast.tsx:72` | | 0 | — |
| 3.3-21 | 3.3 | Shadow `--shadow-modal` | Done | `css:55`, `css:78`; `Modal.tsx:68`, drawer `MobileNav.tsx:86` | | 0 | — |
| 3.3-22 | 3.3 | Shadow `--focus-ring` | Partial | `css:56`, `css:79`; `sf-focus` `index:368-373` | `spark-flow-tokens.json` says "On the sidebar use the dark value in both themes". Sidebar rows (`Sidebar.tsx:102`) use `sf-focus`, so in light theme they get the white-gap ring (`#fff` + `#b72427`) on the dark sidebar. [app check] | 0 | S |
| 3.3-23 | 3.3 | Size `--size-avatar` 36 (message avatars) | Done | `css:94`; `Avatar.tsx:7` `size-sf-avatar` | | 0 | — |
| 3.3-24 | 3.3 | Size `--size-avatar-sm` 20 (small avatars) | Done | `css:95`; `Avatar.tsx:5` | | 0 | — |
| 3.3-25 | 3.3 | Size `--size-control` 32 (icon buttons) | Done | `css:96`; `Button.tsx:60` | | 0 | — |
| 3.3-26 | 3.3 | Size `--size-input` 36 (inputs, labelled buttons) | Done | `css:97`; `Button.tsx:35`, `GlobalSearch.tsx:253` | | 0 | — |
| 3.3-27 | 3.3 | Size `--size-topbar` 56 | Done | `css:98`; `TopBar.tsx:24` `h-sf-topbar` | | 0 | — |
| 3.3-28 | 3.3 | Size `--size-header` 52 (channel header) | Done | `css:99`; `ChannelHeader.tsx:70` | | 0 | — |
| 3.3-29 | 3.3 | Size `--size-tabs` 40 (tabs row) | Done | `css:100`; `Tabs.tsx:27` (44px on phones, `max-md:h-11`) | | 0 | — |
| 3.3-30 | 3.3 | Size `--size-sidebar` 260 (resizable 200–420) | Done | `css:101`; `src/lib/uiStore.ts:11` `{min:200,max:420,initial:260}`; `Sidebar.tsx:515`; drawer `MobileNav.tsx:86` `w-sf-sidebar` | | 0 | — |
| 3.3-31 | 3.3 | Size `--size-panel` 420 (right panel, resizable 360–640) | Different from spec (approved ruling: "the panel stays 384px", `tasks/todo.md:462`) | `css:102` token only; `InspectorFrame.tsx:34` `sm:w-[24rem]` (384px) | Width is 384, not 420. The panel is not resizable (360–640); the ruling covers only the width. `w-sf-panel` is not used. | 2 | M |
| 3.3-32 | 3.3 | Motion: 150ms for hovers | Done | `duration-150` in `Button.tsx:33,100`, `Sidebar.tsx:102,201`, `Toggle.tsx:30`, `NotificationsMenu.tsx:54` | | 0 | — |
| 3.3-33 | 3.3 | Motion: 300ms for menus, panels and toasts | Partial | Inspector slide-in `index:41-42` (0.28s, legacy curve); search results `GlobalSearch.tsx:276` `animate-pop-in` 0.2s | The `sf` `Menu`, `Popover`, `Modal` and `Toast` have no enter transition. The right panel uses the legacy 0.28s curve, not 300ms. | 0 | M |
| 3.3-34 | 3.3 | Motion: 600ms for the selected-row fade | Done | `ChannelMessage.tsx:241` `duration-[600ms] ease-sf` | | 0 | — |
| 3.3-35 | 3.3 | Easing `cubic-bezier(.2,.8,.2,1)` | Partial | `index:309` `--ease-sf`, used by 13 `ease-sf` classes in `sf` primitives and sidebar | Legacy animations still in the shell use `cubic-bezier(0.2, 0.7, 0.2, 1)` (`index:39-43`; `InspectorFrame.tsx:34`, `GlobalSearch.tsx:276,320`). | 0 | S |
| 3.3-36 | 3.3 | Animate opacity and transform only | Done | Hover transitions are `transition-colors` (`Button.tsx:33`, `Sidebar.tsx:102`), which matches the reference CSS (`transition: background-color 150ms…`, reference lines 14, 213) | The spec sentence and the approved reference CSS disagree; the code follows the reference. `UploadTray.tsx:48` transitions `width` on the progress bar. | 0 | — |
| 3.3-37 | 3.3 | Honour `prefers-reduced-motion` | Done | `index:381-386` turns off transitions and animations for `.sf` and `.sf *`; portals get a `.sf` wrapper (`layers.tsx:93`) | Legacy shell pieces use `motion-safe:` instead (`InspectorFrame.tsx:34`, `GlobalSearch.tsx:276`). | 0 | — |
| 3.3-38 | 3.3 | State: hover rows use `surface-hover`; red fills use `accent-fill-hover` | Done | `Button.tsx:9-15`; `Menu.tsx:235`; sidebar rows use `sidebar-hover` (`Sidebar.tsx:107`) | | 0 | — |
| 3.3-39 | 3.3 | State: keyboard focus uses `--focus-ring` on every interactive element | Partial | `sf-focus` on `Button.tsx:33`, `Sidebar.tsx:102`, `UserMenu.tsx:64`, `NotificationsMenu.tsx:54` | `WorkspaceSwitcher.tsx:56` uses `roundButtonClass` (`src/components/ui/styles.ts:3`: `ring-2 ring-brand-500`). Legacy menu items (`UserMenu.tsx:110,133,160`, `NotificationsMenu.tsx:85`, `menuItemClass` in `src/components/ui/Menu.tsx`) and the phone search input (`GlobalSearch.tsx:340`) have no `--focus-ring`. [app check] | 0 | M |
| 3.3-40 | 3.3 | State: input focus = `focus` border plus a 3px `surface-mention` halo | Partial | `GlobalSearch.tsx:253`, `TokenInput.tsx:96`, `ChannelDetails.tsx:290`, `ChannelMembers.tsx:76`, `FileActions.tsx:32` | Two inputs use the keyboard ring instead: `RichComposer.tsx:463` (link field) and `EmojiPicker.tsx:119` (picker search). The phone search input uses brand-500 (`GlobalSearch.tsx:340`). | 0 | S |
| 3.3-41 | 3.3 | State: composer focus changes only the border, to `text-secondary` | Done | `RichComposer.tsx:288` `focus-within:border-sf-text-secondary` | | 0 | — |
| 3.3-42 | 3.3 | State: disabled = `surface-hover` fill, `line` border, `text-muted` label | Done | `Button.tsx:34`; `IconButton` `Button.tsx:100` (text-muted only, as the reference icon button) | | 0 | — |
| 5.1-01 | 5.1 | Sidebar on `app-frame`, full height | Done | `Sidebar.tsx:514-516` `sticky top-0 h-screen bg-sf-app-frame` (`lg:flex`) | | 0 | — |
| 5.1-02 | 5.1 | Sidebar width 260px | Done | `uiStore.ts:11,38`; `Sidebar.tsx:515` | | 0 | — |
| 5.1-03 | 5.1 | Resizable 200–420 | Done | `SidebarResizer` `Sidebar.tsx:463-509` (drag, arrow keys, Home/End, double-click reset, RTL); clamp `uiStore.ts:96-97`; `SidebarResizer.test.tsx` passes | The resizer is not shown when the icon-only rail is on (`Sidebar.tsx:522`), and the drawer is fixed at 260. | 0 | — |
| 5.1-04 | 5.1 | Width persisted per user | Partial | `uiStore.ts:91-123` zustand `persist`, key `spark-flow.ui` in localStorage | Stored per browser, shared by every "View as" person and every account. Not keyed by user and not saved on the account. | 0 | M |
| 5.1-05 | 5.1 | Logo header: keep Spark logo and the "FLOW" label | Done | `Sidebar.tsx:418-432` (white logo, 1×20 `ink-700` divider, `sf-label` FLOW); `SidebarHeader` `:435-451` | | 0 | — |
| 5.1-06 | 5.1 | Header: New message icon button (white square) at the end | Done | `Sidebar.tsx:443` `IconButton tone="compose" IconEdit`; `Button.tsx:55` `bg-sf-white text-sf-ink-950`, hover `ink-100`; opens `NewMessageSheet` | | 0 | — |
| 5.1-07 | 5.1 | Header row dimensions as in the reference (`.sf-ws` 44px) | Different from spec | `Sidebar.tsx:439` `h-14` (56px) | [app check] Reference `.sf-ws` is 44px high (reference CSS line 76). 56px lines up with the 56px top bar; spec text gives no height. | 0 | S |
| 5.1-08 | 5.1 | Work section (Home, Projects, My tasks, Teams) as `sf-side-item` rows | Done | `Sidebar.tsx:271-286`, same items as `navigation.ts:27-34` | | 0 | — |
| 5.1-09 | 5.1 | Manage section (Dashboard, Time & cost) as rows | Done | `Sidebar.tsx:288-301`; still permission-gated (`dashboard.view`, `timeCost.view`) | | 0 | — |
| 5.1-10 | 5.1 | Chat group, collapsible | Done | `Sidebar.tsx:303-324` `SideSection id="chat"` with chevron | | 0 | — |
| 5.1-11 | 5.1 | Chat: Threads row | Partial | `Sidebar.tsx:305-309`. **Hidden behind the `chatRedesign` flag** (`Sidebar.tsx:265`; `src/lib/features.ts:27-31`: off by default, forced off in production builds). | Row is hidden unless `localStorage['spark-flow.features']='chatRedesign'` in a dev or prototype build. With the flag on it links to `/w/:ws/threads`, a route that does not exist (`src/router.tsx:70-84`), so it shows NotFound. The Threads view is Phase 3. | 3 | S |
| 5.1-12 | 5.1 | Chat: Activity row, bold with a red count while unread mentions or reactions | Done | `Sidebar.tsx:310-312` (`mentions={activityUnread}`, `noun=['unread','unread']`); count `useSidebarGroups.ts:49`; bold when count > 0 (`Sidebar.tsx:93`); `SideLink.test.tsx` | | 2 | — |
| 5.1-13 | 5.1 | Chat: Drafts & sent row | Partial | `Sidebar.tsx:313-317`. **Hidden behind the `chatRedesign` flag** (same as 5.1-11). | Flag off by default and in production; `/w/:ws/drafts` has no route. Drafts & sent view is Phase 3. | 3 | S |
| 5.1-14 | 5.1 | Drafts & sent: muted count of drafts plus scheduled messages | Not started (later phase) | `SideLink` supports `trail` (`Sidebar.tsx:154-156`) but the row passes none (`Sidebar.tsx:316`) | Scheduled messages are Phase 3. `useSidebarGroups.ts:20-21` already loads drafts, so the draft half could be shown now. | 3 | S |
| 5.1-15 | 5.1 | Chat: Saved row | Partial | `Sidebar.tsx:318-320`. **Hidden behind the `chatRedesign` flag** (same as 5.1-11). | Flag off by default and in production; `/w/:ws/saved` has no route. Saved is Phase 3. | 3 | S |
| 5.1-16 | 5.1 | Saved: muted count of in-progress items | Not started (later phase) | No count passed (`Sidebar.tsx:319`); no Saved data exists | Needs the Saved feature (Phase 3). | 3 | S |
| 5.1-17 | 5.1 | Starred section (starred channels and DMs) | Done | `Sidebar.tsx:326-334`; `useSidebarGroups.ts:42` (listed once, muted last); row states shared with Channels | Shown only when something is starred, and not behind the flag, although the `features.ts:5-6` comment lists Starred as gated. | 0 | — |
| 5.1-18 | 5.1 | Channels: add button on hover | Done | `Sidebar.tsx:337-343` plus `SideSection` actions revealed on hover or focus (`:205`) | | 0 | — |
| 5.1-19 | 5.1 | Channels: options button on hover | Missing | `Sidebar.tsx:340-342` has only the add button | No options control next to add. The spec does not say what the options are. | 0 | S |
| 5.1-20 | 5.1 | Channels: "Add channels" row at the end | Missing | `Sidebar.tsx:345-353` ends with the channel list | No trailing "Add channels" row. | 0 | S |
| 5.1-21 | 5.1 | Direct messages: avatar with presence | Done | `Sidebar.tsx:233` (`Avatar size="sm" presence on="frame"`); `Avatar.tsx:75-87` (8px dot, frame-coloured ring) | | 0 | — |
| 5.1-22 | 5.1 | Direct messages: group DMs show their names | Done | `channels.ts:14` joins the other members' names; `useSidebarGroups.ts:33` `group` flag; `Sidebar.tsx:233` `IconUsers` | | 0 | — |
| 5.1-23 | 5.1 | Direct messages: viewer's self-DM labelled "you" | Done | `channels.ts:12` gives "Name (you)" | Reads "Name (you)" rather than "you" alone. | 0 | — |
| 5.1-24 | 5.1 | Apps section (Flowbot, reminders and notices) | Not started (later phase) | No Apps section in `Sidebar.tsx`; no Flowbot code (`Avatar.tsx:46,55` `app` prop only; `features.ts:5-6` mentions Apps) | Flowbot arrives with Remind me (Phase 3); apps are Phase 4. | 3 | M |
| 5.1-25 | 5.1 | Projects (existing) | Done | `Sidebar.tsx:378-396` | | 0 | — |
| 5.1-26 | 5.1 | Call bar (P2), only while in a call, above Settings | Not started (later phase) | No call code in `Sidebar.tsx` or `src` | Calls are Phase 4 (6.13). | 4 | L |
| 5.1-27 | 5.1 | Settings pinned at the bottom | Done | `Sidebar.tsx:402-406` (`flex-none`, outside the scrolling `nav`) | Still shown only to roles that pass `database.manage` (`navigation.ts:48`), as before. | 0 | — |
| 5.1-28 | 5.1 | Section order: logo, Work, Manage, Chat, Starred, Channels, DMs, Apps, Projects, Call bar, Settings | Partial | `Sidebar.tsx:271-406` follows this order for what exists | Apps (5.1-24) and the call bar (5.1-26) are absent. | 0 | — |
| 5.1-29 | 5.1 | Row: 28px high | Done | `Sidebar.tsx:102` `lg:h-7`; 44px below `lg` for touch (`h-11`, comment `Sidebar.tsx:72`) | | 0 | — |
| 5.1-30 | 5.1 | Row: 2px gaps | Done | `Sidebar.tsx:188,210` `gap-0.5` | | 0 | — |
| 5.1-31 | 5.1 | Row: `radius-md` | Done | `Sidebar.tsx:102` `rounded-sf-md` | | 0 | — |
| 5.1-32 | 5.1 | Row: 18px icon | Done | `Sidebar.tsx:121-127` `Icon size={18}` | | 0 | — |
| 5.1-33 | 5.1 | Row: `ui` type (14/20) | Done | `Sidebar.tsx:102` `text-[14px]/[20px] font-sf` (same values as `sf-ui`) | | 0 | — |
| 5.1-34 | 5.1 | State Read: `sidebar-text` | Done | `Sidebar.tsx:108` | | 1 | — |
| 5.1-35 | 5.1 | State Unread: `sidebar-text-strong`, weight 600 | Done | `Sidebar.tsx:93,108,110`; `SideLink.test.tsx` | | 1 | — |
| 5.1-36 | 5.1 | State Active: `sidebar-active` background; icon in `sidebar-accent` | Done | `Sidebar.tsx:104-105,125`; `SideLink.test.tsx` "the active row gets…" | | 0 | — |
| 5.1-37 | 5.1 | State Muted: `sidebar-text-muted`, bell-off icon, never a count | Done | `Sidebar.tsx:91` (count forced to 0), `:108`, `:147-148` `IconBellOff`; `channels.ts:81` | | 2 | — |
| 5.1-38 | 5.1 | State Mentions: `accent-fill` badge (min 20×18, radius-full, 12/600) at the row end | Done | `Sidebar.tsx:141-146`; `Badge.tsx:7-19` (`h-[18px] min-w-5 rounded-sf-full text-[12px]/[18px] font-semibold`, "99+" cap) | | 1 | — |
| 5.1-39 | 5.1 | State Draft: pencil at the row end when there is no count | Done | `Sidebar.tsx:149-153` `IconPencil`; `useSidebarGroups.ts:21,33` (`draft` from `useDrafts`) | A muted row shows the bell-off icon instead of the pencil. | 1 | — |
| 5.1-40 | 5.1 | State Private channel: lock instead of `#` | Done | `Sidebar.tsx:233` `channel.isPrivate ? IconLock : IconHash` | | 0 | — |
| 5.1-41 | 5.1 | Section labels in `label` type | Done | `Sidebar.tsx:195` `sf-label` | | 0 | — |
| 5.1-42 | 5.1 | Section labels have a chevron to collapse | Done | `Sidebar.tsx:190-202` (`aria-expanded`, `IconChevronDown` rotates) | | 0 | — |
| 5.1-43 | 5.1 | Collapse state persisted per user | Partial | `uiStore.ts:16,98-103` (`collapsedSections`), persisted as in 5.1-04 | Per browser, not per user. | 0 | M |
| 5.1-44 | 5.1 | Rows do not shrink (`flex: none`); the list scrolls | Done | `Sidebar.tsx:102` `flex-none`; `li` `flex-none` throughout; `nav` `overflow-y-auto` (`:270`) | | 0 | — |
| 5.1-45 | 5.1 | Drag to reorder channels in Starred and Channels (Phase 3) | Not started (later phase) | No drag or sort code in `Sidebar.tsx`; channels are sorted A–Z by `channels.ts:25-35` | `sidebar_position` is not in `src/api/types.ts`. | 3 | L |
| 5.2-01 | 5.2 | Top bar inside the main card, 56px | Done | `TopBar.tsx:24` `h-sf-topbar` (`--size-topbar` 56); rendered inside the card `AppLayout.tsx:40-47` | | 0 | — |
| 5.2-02 | 5.2 | Top bar on `surface` | Done | `TopBar.tsx:24` `bg-sf-surface` | | 0 | — |
| 5.2-03 | 5.2 | Top bar bottom border `line` | Done | `TopBar.tsx:24` `border-b border-sf-line` | | 0 | — |
| 5.2-04 | 5.2 | Sidebar toggle | Done | `TopBar.tsx:25-35` (collapse/expand on desktop, opens the drawer below `lg`) | | 0 | — |
| 5.2-05 | 5.2 | Search box 440px wide | Done | `GlobalSearch.tsx:232` `max-w-[440px]` | | 0 | — |
| 5.2-06 | 5.2 | Search box 36px tall | Done | `GlobalSearch.tsx:253` `h-sf-input` | | 0 | — |
| 5.2-07 | 5.2 | Search box on `surface-sunken` | Done | `GlobalSearch.tsx:253` `bg-sf-surface-sunken border-sf-line` | | 0 | — |
| 5.2-08 | 5.2 | Placeholder "Search pages, tasks, people, messages…" | Different from spec | `GlobalSearch.tsx:252` reads "Search pages, tasks, people, channels…" | Says "channels" where the spec says "messages". Messages are not searched yet (`GlobalSearch.tsx:18` TODO(api); search is Phase 3). No ruling recorded. | 3 | S |
| 5.2-09 | 5.2 | ⌘K hint in the box | Done | `GlobalSearch.tsx:269-272` `Kbd` "⌘"/"Ctrl" + "K" (platform-aware, `:192`) | | 0 | — |
| 5.2-10 | 5.2 | Spacer between search and the right-hand controls | Done | `TopBar.tsx:40` `ms-auto` | | 0 | — |
| 5.2-11 | 5.2 | Bell, round | Done | `NotificationsMenu.tsx:54` `size-sf-control rounded-sf-full border border-sf-line` | | 0 | — |
| 5.2-12 | 5.2 | Bell red dot when unread | Done | `NotificationsMenu.tsx:60-62` (8px, `top-1.5`, `end-[7px]`, ring `var(--surface)`) matches reference `.sf-topbar-dot`; bell counts mentions only (ruling `tasks/todo.md:527`) | | 0 | — |
| 5.2-13 | 5.2 | "SE" control, unchanged (**OPEN**: confirm what it is) | OPEN | It is the workspace switcher showing the initials of "Spark Engineering": `WorkspaceSwitcher.tsx:11-27,47-60`, mounted at `TopBar.tsx:44`. Left as it was (section 13 item 3). | Question still unanswered; nothing was changed. It keeps the legacy look: 36px (`size-9`, `src/components/ui/styles.ts:3`) next to the 32px bell, legacy ring and menu, and it stays visible on phones. | 0 | S |
| 5.2-14 | 5.2 | Profile: 36px avatar with presence | Partial | `UserMenu.tsx:67` `Avatar` default `lg` = 36px, presence from `people.data` | With `VITE_BACKEND=on` the users query is skipped (`UserMenu.tsx:28` `useUsers(backendOn ? undefined : …)`), so no presence dot shows. | 0 | S |
| 5.2-15 | 5.2 | Profile: name in `ui-medium` | Done | `UserMenu.tsx:74` `sf-ui-medium` | | 0 | — |
| 5.2-16 | 5.2 | Profile: role in `meta` | Done | `UserMenu.tsx:75` `sf-meta` shows `persona.title` (the line the Spark CRM menu showed under the name) | | 0 | — |
| 5.2-17 | 5.2 | Profile: chevron | Done | `UserMenu.tsx:83-87` `IconChevronDown` (hidden on phones) | | 0 | — |
| 5.2-18 | 5.2 | ⌘K or Ctrl+K focuses search | Done | `GlobalSearch.tsx:212-219` (also `/` outside text fields) | | 0 | — |
| 5.2-19 | 5.2 | With a query, the box shows the query and a clear button | Done | `GlobalSearch.tsx:244,256-267` (`Clear search` replaces the ⌘K hint when `term` is set) | | 0 | — |
| 5.3-01 | 5.3 | Main card `radius-lg` (12px) | Done | `AppLayout.tsx:40` `lg:rounded-[12px]` | Literal value, not the `rounded-sf-lg` token. | 0 | — |
| 5.3-02 | 5.3 | Main card on `surface` | Different from spec | `AppLayout.tsx:40` `lg:bg-canvas`; legacy `--canvas` is #f8fafc light / #141414 dark (`index:182,216`) | Spec says `surface` (#ffffff / #121214). [app check] The channel header is painted `bg-sf-surface` (`ChannelPage.tsx:230`) and the composer `bg-sf-surface`, but the message area has no background of its own, so in light theme the list shows #f8fafc between two white bands. | 0 | S |
| 5.3-03 | 5.3 | Card inset 8px from the top, right and bottom of the frame | Done | `AppLayout.tsx:40` `lg:my-2 lg:me-2` (desktop only); frame `AppLayout.tsx:34` | | 0 | — |
| 5.3-04 | 5.3 | Card `overflow: hidden` | Done | `AppLayout.tsx:40` `lg:overflow-hidden` | | 0 | — |
| 5.3-05 | 5.3 | Channel view and right panel share the card, with a `line` border between them | Different from spec | `AppLayout.tsx:72` renders `<Inspector />` as a sibling of the card; `InspectorFrame.tsx:34` `xl:relative xl:m-2 xl:ms-0 xl:rounded-2xl xl:border xl:border-line xl:shadow-lg` | At 1280+ the panel is its own floating rounded card (16px radius, own margin, shadow) beside the main card, not inside it. No ruling recorded (the 384px ruling covers width only). | 2 | M |
| 5.4-01 | 5.4 | ≥1280: full layout, panel pushes the channel | Done | `InspectorFrame.tsx:34` `xl:relative xl:shrink-0`; `Sidebar.tsx:516` `lg:flex` | | 0 | — |
| 5.4-02 | 5.4 | 1024–1279: right panel overlays the channel | Done | `InspectorFrame.tsx:34` `sm:fixed sm:end-0 sm:top-0 sm:h-full sm:w-[24rem]` (no dimming), slides in | [app check] It is fixed to the window, so it also covers the top bar, not only the channel. | 0 | — |
| 5.4-03 | 5.4 | 768–1023: sidebar collapses to a drawer opened by the toggle | Done | `Sidebar.tsx:516` `hidden lg:flex`; `TopBar.tsx:25-27` "Open menu"; `MobileDrawer` `MobileNav.tsx:78-97` | The phone bottom bar (`MobileNav.tsx:56`, `lg:hidden`) also shows at these widths. | 0 | — |
| 5.4-04 | 5.4 | <768: single pane | Done | `AppLayout.tsx:32,54` pane mode (`h-dvh`, bottom bar offset); drawer plus bottom nav (`MobileNav.tsx`); inspector becomes a bottom sheet (`InspectorFrame.tsx:34`) | [app check] 6.16 is audited separately. | 0 | — |
| 5.4-05 | 5.4 | <768: the topic collapses into the channel's more menu | Done | `ChannelHeader.tsx:84` topic `hidden md:block`; `:132` `phone && topic && <MenuHeading>` in the "Channel actions" menu | | 0 | — |
| 5.4-06 | 5.4 | <768: the facepile collapses into the channel's more menu | Partial | `ChannelHeader.tsx:182-188` `MembersButton` is hidden below a 560px header (`@min-[560px]:inline-flex`) | It is hidden but not added to the more menu. Members stay reachable through "Channel details". | 0 | S |
| 5.4-07 | 5.4 | <768: Call collapses into the channel's more menu | Not started (later phase) | No Call control in `ChannelHeader.tsx` | Calls are Phase 4 (6.13). | 4 | L |
| 5.4-08 | 5.4 | <768: the top bar hides the role text | Done | `UserMenu.tsx:73` `sr-only … md:not-sr-only` (name and role hidden below 768, still read by screen readers) | | 0 | — |
| 5.4-09 | 5.4 | <768: the top bar hides round buttons | Partial | Bell hidden: `NotificationsMenu.tsx:44` `hidden … md:block`. Search becomes a round button, `GlobalSearch.tsx:298` `md:hidden`. | The workspace round button stays on phones (`WorkspaceSwitcher.tsx:56`, no breakpoint). [app check] | 0 | S |

#### Notes

- **Flag `chatRedesign`** (`src/lib/features.ts`). It hides the Chat group's Threads, Drafts & sent and Saved rows (`Sidebar.tsx:305-322`). Off by default, and `parseFeatures` returns an empty set in a production build, so those rows never ship. With it on, the links go to `/w/:ws/threads`, `/drafts` and `/saved`, which have no route (`src/router.tsx:70-84`).
- The `features.ts:5-6` comment also lists Starred and Apps as gated. In code Starred is not gated (it shows whenever something is starred) and Apps does not exist.
- **Token-name collisions.** The legacy app tokens `--surface`, `--surface-sunken`, `--line`, `--line-strong` and `--accent` (`index:182-230`) share names with the chat tokens. Inside any `.sf` element, legacy utilities such as `bg-surface`, `border-line` and `text-accent` silently take the chat values. This is why the legacy dropdowns inside `header.sf` still look consistent. A legacy component dropped outside `.sf` gets the old values.
- **Shell menus not converted.** The account, workspace and notification dropdowns, the search results panel, the phone search screen, the mobile bottom bar and `InspectorFrame` are still Spark CRM styled (`MenuPanel`, `rounded-lg/xl`, `shadow-xl`, lucide icons, brand-500 focus). CLAUDE.md says chat uses the `sf` primitives; these are the shell, so the "Don't reuse Tailwind's defaults" line of 3.1 is only partly met.
- **Main card colour.** `AppLayout.tsx:40` paints the card with the legacy `bg-canvas`, which also feeds every non-chat page. The chat parts paint themselves `sf-surface`. This is the most likely visible mismatch in light theme (5.3-02).
- **Right panel.** It is a separate floating card with its own radius, margin and shadow at 1280+ (5.3-05), 384px wide and not resizable (3.3-31). The `--size-panel` token is unused.
- **Extras not in the spec:** a 72px icon-only sidebar rail (`uiStore.sidebarCollapsed`, `Sidebar.tsx:515`), the running-timer pill in the top bar (`TopBar.tsx:41`), and a theme toggle in the account menu (`UserMenu.tsx:100-125`; the spec's dark toggle is Phase 4).
- **Persistence.** All sidebar preferences (width, collapsed sections, collapsed rail) live in one browser-wide localStorage key, `spark-flow.ui`. A per-user store (or a saved account preference) would close 5.1-04 and 5.1-43 together.
- **Gallery coverage.** `sf-display`, `sf-body-ar` and `sf-heading-ar` appear only in `/dev/ui` (`UiGallery.tsx:111,121`).
- **Tests.** Tokens, `SideLink` states and the resizer are covered by unit tests. Nothing tests `TopBar`, `AppLayout`, the main card, `SideSection` collapse persistence or the sidebar order.
- The brief said to use git; the repo has no `.git`, so nothing was diffed. All findings are from reading source and the three unit tests above.

### Audit B: FLOW_CHAT_REDESIGN.md 6.1 Channel header and tabs, 6.2 Message list, 6.3 Message

Repo: `spark-flow-web`. Paths are relative to it. Phase = the spec's section 12 phase for the item. Items marked "[app check]" can only be fully judged in the running app; the evidence is from the code.

| ID | Section | Requirement | Status | Evidence | Gap | Phase | Effort |
|---|---|---|---|---|---|---|---|
| 6.1-01 | 6.1 | Header row is 52px | Done | `src/pages/chat/ChannelHeader.tsx:70` (`h-sf-header`); `src/index.css:303`; `src/styles/flow-tokens.css:99` (`--size-header: 52px`) | | 1 | — |
| 6.1-02 | 6.1 | Name button `# backend ▾`, `heading` style, opens Channel details on About | Done | `ChannelHeader.tsx:73-82` (`sf-heading`, 32px high, hover `surface-hover`, hash icon + name + chevron); test `ChannelHeader.test.tsx:33`. A DM's name is plain text (approved ruling, slice 4: no details for DMs) | | 1 | — |
| 6.1-03 | 6.1 | Lock icon for private channels | Done | `ChannelHeader.tsx:67` (`IconLock` when `channel.isPrivate`, else `IconHash`) | | 1 | — |
| 6.1-04 | 6.1 | Star toggle | Done | `ChannelHeader.tsx:90-97` (`IconButton`, `pressed`, 28px); test `ChannelHeader.test.tsx:56` | | 1 | — |
| 6.1-05 | 6.1 | Topic in `small`/`text-secondary`, truncated, with a left `line` separator | Done | `ChannelHeader.tsx:98-102` (`border-s border-sf-line ps-3`, `sf-small truncate text-sf-text-secondary`; hidden below `md`, as the reference does under 768px) | | 1 | — |
| 6.1-06 | 6.1 | Empty topic shows "Add a topic" in `text-muted` | Different from spec | `ChannelHeader.tsx:103-108` (`text-sf-text-muted`, opens About with the topic field open) | Only shown when `rights.manage`; everyone else sees an empty slot. Sensible, but not recorded as a ruling (test `ChannelHeader.test.tsx:44` states it) | 1 | S |
| 6.1-07 | 6.1 | Members button: three 20px avatars + count | Done | `ChannelHeader.tsx:171-191` (`Avatar size="sm"` = 20px, 28px high, `line-strong` border, count with sr-only "members", opens Members) | | 1 | — |
| 6.1-08 | 6.1 | Call split button | Not started (later phase) | Code comment `ChannelHeader.tsx:51`: "Call and channel search come in later phases"; no Call control anywhere in the header | Whole Call feature (6.13): split button, start/join. Spec section 12 puts Calls in Phase 4 | 4 | L |
| 6.1-09 | 6.1 | Notifications bell (6.11) | Done | `ChannelHeader.tsx:118-131` with `NotifyLevelMenu`; name says muted/nothing; tests `ChannelHeader.test.tsx:139-` | | 2 | — |
| 6.1-10 | 6.1 | Channel search button (opens Search scoped `in:#channel`) | Not started (later phase) | No search button in `ChannelHeader.tsx`; `src/layout/GlobalSearch.tsx:21-22` has `TODO(api)`: no message search and no `in:` scoping anywhere (grep) | Needs the Search view and its index (Phase 3) before the header button has anything to open | 3 | L |
| 6.1-11 | 6.1 | More (⋮) button | Done | `ChannelHeader.tsx:132` (`IconDotsVertical`, "Channel actions") | | 1 | — |
| 6.1-12 | 6.1 | ⋮ menu: Channel details | Done | `ChannelHeader.tsx:134-138` (channels only; DMs have no details, approved ruling slice 4) | | 2 | — |
| 6.1-13 | 6.1 | ⋮ menu: Copy link | Done | `ChannelHeader.tsx:139-149` (says "Link copied" beside the menu); tests `ChannelHeader.test.tsx:101,116` | | 1 | — |
| 6.1-14 | 6.1 | ⋮ menu: Mark all read | Done | `ChannelHeader.tsx:150-152` (disabled when `unreadCount` is 0) | | 1 | — |
| 6.1-15 | 6.1 | ⋮ menu: Notification settings | Missing | Menu at `ChannelHeader.tsx:132-164` has no such item; the bell (`:118-131`) holds the level and Mute (slice 3 ruling: "Mute leaves the ⋮ menu") | The spec lists "notification settings" in ⋮. Only the bell covers it. Add an item that opens the same levels menu or the Notifications tab of details | 2 | S |
| 6.1-16 | 6.1 | ⋮ menu: Leave | Done | `ChannelHeader.tsx:154-158` (shown when `rights.leave`) | | 1 | — |
| 6.1-17 | 6.1 | ⋮ menu: Archive, for admins | Different from spec | `ChannelHeader.tsx:159-163` (`rights.manage`); `src/lib/permissions.ts:51` (`channel.manage`: members of the channel, and Admins for public ones) | Spec says admins. Built: any member (and admins on public channels). The rule predates the chat redesign and isn't recorded as a chat ruling; 6.10 also says "Settings (admin)" | 2 | S |
| 6.1-18 | 6.1 | Tabs row is 40px | Done | `src/components/sf/Tabs.tsx:27` (`h-sf-tabs`, `max-md:h-11` on phones); `flow-tokens.css:100` | | 1 | — |
| 6.1-19 | 6.1 | Messages tab | Done | `ChannelTabs.tsx:8`; the only tab with content (`ChannelPage.tsx:126-131`) | | 1 | — |
| 6.1-20 | 6.1 | Files tab present (Phase 1: stub) | Done | `ChannelTabs.tsx:9`; `TabStub` `:29-38` ("Files shared in this channel will be listed here.") | | 1 | — |
| 6.1-21 | 6.1 | Pins tab present (Phase 1: stub) | Done | `ChannelTabs.tsx:10`; `TabStub` `:31` | | 1 | — |
| 6.1-22 | 6.1 | Pins tab shows a count | Not started (later phase) | `Tabs.tsx:7,53-54` supports `count`, but `ChannelTabs.tsx:25-26` passes none; no pin data in `src/api/types.ts` (grep: no `pinned`/`pinCount`) | No pins to count. Comes with the Pin action and the Pins tab | 3 | S |
| 6.1-23 | 6.1 | Page tab present (Phase 1: stub; DMs have none) | Done | `ChannelTabs.tsx:11,16`; `TabStub` `:32` | | 1 | — |
| 6.1-24 | 6.1 | A separator after the tabs (`sf-tabs-sep`) | Not started (later phase) | None in `ChannelTabs.tsx` or `Tabs.tsx` | Only meaningful once bookmarks exist (Phase 3) | 3 | S |
| 6.1-25 | 6.1 | Bookmarks in the tabs row | Not started (later phase) | `ChannelTabs.tsx:24` comment: "Bookmarks and + come in a later phase"; no Bookmark data or API (spec section 7 entity "Bookmark / ChannelTab") | Data model, routes, row rendering, edit/remove | 3 | L |
| 6.1-26 | 6.1 | "+" at the end of the tabs row: add a bookmark (link or Flow page) or a tab | Not started (later phase) | Not in `Tabs.tsx` / `ChannelTabs.tsx` | The "+" menu and the add-bookmark/add-tab forms | 3 | M |
| 6.1-27 | 6.1 | Active tab uses `text` + 2px `accent-fill` rule; others `text-secondary` | Done | `Tabs.tsx:44-48` (`after:h-0.5 after:bg-sf-accent-fill`, `text-sf-text` vs `text-sf-text-secondary`). The row's line is an inset shadow (`:27`), approved ruling in slice 3 (todo.md:529) | | 1 | — |
| 6.1-28 | 6.1 | Files tab lists every file in the channel, filterable by type, person and date | Not started (later phase) | Stub only (`ChannelTabs.tsx:30`). File cards and File details exist for messages (slice 6) but no channel-wide list | List view, three filters, endpoint listing files by channel | 3 | L |
| 6.1-29 | 6.1 | Pins tab lists pinned messages | Not started (later phase) | Stub only (`ChannelTabs.tsx:31`); no Pin in the message menu or API | Pin action, Pin entity, list | 3 | L |
| 6.1-30 | 6.1 | Page tab is the channel page (6.14) | Not started (later phase) | Stub only (`ChannelTabs.tsx:32`) | The channel page (rich doc) | 4 | L |
| 6.1-31 | 6.1 | AC: the header never wraps | Done | `ChannelHeader.tsx:70` (single flex row, fixed 52px, no `flex-wrap`; name `flex-none`, capped at `40cqw`, `whitespace-nowrap`) | [app check] at 1024-1279px and with a very long name | 1 | — |
| 6.1-32 | 6.1 | AC: the topic truncates first | Done | `ChannelHeader.tsx:98-100` (`min-w-0 flex-1`, `truncate`); name and action cluster are `flex-none` | | 1 | — |
| 6.1-33 | 6.1 | AC: then the facepile goes | Done | `ChannelHeader.tsx:186` (`hidden ... @min-[560px]:inline-flex` on the header's own width, via `@container` `:70`) | [app check] It disappears at a fixed 560px header width, not at the moment the topic has run out of room | 1 | — |
| 6.1-34 | 6.1 | AC: then Call moves into ⋮ | Not started (later phase) | No Call control to move | Moves with 6.1-08 | 4 | S |
| 6.2-01 | 6.2 | Virtualized list | Done | `src/pages/chat/MessageList.tsx:148-163` (`@tanstack/react-virtual` 3.14.23 / virtual-core 3.19.8, `overscan: 10`) | | 1 | — |
| 6.2-02 | 6.2 | Anchored to the bottom | Done | `MessageList.tsx:158-160` (`anchorTo: 'end'`, `followOnAppend`), `:234-251` opens at the newest; browser tests `MessageList.browser.test.tsx:161,188` | | 1 | — |
| 6.2-03 | 6.2 | Loads older pages upward | Done | `MessageList.tsx:202` (fetches when `scrollTop < clientHeight`), `:412-414` "Loading older messages…" | | 1 | — |
| 6.2-04 | 6.2 | Stable scroll position when older pages load | Done | `anchorTo: 'end'` (`:158`); browser test `MessageList.browser.test.tsx:168` (view moves at most 2px) | | 1 | — |
| 6.2-05 | 6.2 | Target 60fps with 10,000 loaded messages | Partial | Virtualized (`:148`); the largest browser test is 80 messages (`MessageList.browser.test.tsx:161-`) | No test or measurement at 10,000. Each render also does O(n) work outside any memo: `unreadSummary` (`:342`), the `newer` filter (`:347`), `rows.findIndex` (`:177`), `rows.slice` (`:345`) | 1 | S |
| 6.2-06 | 6.2 | `role="log"` | Done | `MessageList.tsx:351` | | 1 | — |
| 6.2-07 | 6.2 | `aria-live="polite"` for new messages | Different from spec | `MessageList.tsx:351` (the log itself is `aria-live="off"`), `:444-446` (a separate sr-only `aria-live="polite"` paragraph reads someone else's new message), `:316-330`; test `MessageList.browser.test.tsx:142-158` | Deliberate (virtualized rows mounting would be read out) and tested, but not recorded as a ruling in `tasks/todo.md` | 1 | S |
| 6.2-08 | 6.2 | Each calendar day is by the viewer's time zone | Done | `messageRows.ts:71-72` using `localDay` (`src/lib/dates.ts:13`, the browser's local day); test `messageRows.test.ts:70` | | 1 | — |
| 6.2-09 | 6.2 | Each day wrapped in its own section (`sf-day`) | Different from spec | `messageRows.ts:5-8,60-83`: a flat list of `day`, `new` and `message` rows; `MessageList.tsx:352-381` renders one `<ol>` of absolutely placed `<li>`s. No `sf-day` wrapper, so there is no per-day sticky containment | Built as a flat virtual list with a JS overlay instead of sections (see 6.2-10 to 6.2-12). Not recorded as a ruling. The unit test is even titled "wraps each day in a section" (`messageRows.test.ts:70`) but asserts flat rows | 1 | M |
| 6.2-10 | 6.2 | Date pill sticks 8px below the list top while its day is on screen | Done | `MessageList.tsx:404-411` (overlay `top-2` = 8px; `top-12` while the unread bar shows), `:338-341` picks the day of the row 8px under the top; pill look matches `.sf-datepill` (`:485`: 28px, `surface-raised`, `shadow-toolbar`, 13/18 500, chevron) | [app check] It is a copy of the divider laid over the list (`aria-hidden`), not the divider itself. No test covers it (grep: no sticky test) | 1 | — |
| 6.2-11 | 6.2 | The next day's pill pushes it out | Different from spec | `MessageList.tsx:340-341`: the overlay is hidden as soon as any day divider starts within the top 8..40px band (`dividerAtTop`) and the in-flow divider takes over | No push: the pill pops out (and for a moment there is no pill at the top, the next one is still about 40px down) rather than being pushed up by the next one. [app check] | 1 | M |
| 6.2-12 | 6.2 | Only one sticky pill at a time (can more than one pill show?) | Partial | `MessageList.tsx:336-341,357-358,404-411`. Walking the code: (a) the sticky copy plus the in-flow dividers of later days can show together, as in the spec's own model; (b) unintended: when a divider is -8 to -32px above the top, `dividerAtTop` is false and the overlay shows that same day (`dayOf[top.index]`) while the divider's own pill (`DayDivider`, `:488-503`) is still partly on screen, so two pills of the same label overlap, offset by about 10px; (c) with the unread bar open the overlay sits at 48px (`:406`) but the hide band is still 0..40px, so the sticky and the next day's pill can collide | [app: confirmed. Two pills of one day show at once; screenshots 02, 11, 12] Two pills of one day can show at once for about 24px of scroll, and the hide test ignores the bar offset. . Fix: position the overlay by the next divider's offset (translate it up as that divider arrives) and never show it for a day whose divider is in the viewport | 1 | M |
| 6.2-13 | 6.2 | AC: the sticky pill never overlaps the header | Done | The overlay sits inside the list wrapper (`MessageList.tsx:350,404-411`), below the header and tabs; `LIST_OVERLAY` keeps message toolbars clear (`:385,407`) | [app check] | 1 | — |
| 6.2-14 | 6.2 | Labels "Today", "Yesterday", "Friday, October 23" | Done | `messageRows.ts:38-49`; test `messageRows.test.ts:58-64` | | 1 | — |
| 6.2-15 | 6.2 | Year added when it differs from the current one | Done | `messageRows.ts:47`; test `messageRows.test.ts:58-64` ("Thursday, October 23, 2025") | | 1 | — |
| 6.2-16 | 6.2 | Clicking the pill opens a menu | Done | `MessageList.tsx:460-483` (`DayMenu`, "Jump to"), used by both the divider (`:494`) and the sticky copy (`:408`) | | 1 | — |
| 6.2-17 | 6.2 | Pill menu: Today | Done | `MessageList.tsx:452`; `jumpSince` `messageRows.ts:94-100`; test `messageRows.test.ts:139` | | 1 | — |
| 6.2-18 | 6.2 | Pill menu: Yesterday | Done | `MessageList.tsx:453` | | 1 | — |
| 6.2-19 | 6.2 | Pill menu: Last week | Done | `MessageList.tsx:454` (from local midnight 7 days ago, `api-contract.md:78`) | | 1 | — |
| 6.2-20 | 6.2 | Pill menu: Last month | Done | `MessageList.tsx:455` | | 1 | — |
| 6.2-21 | 6.2 | Pill menu: The very beginning | Done | `MessageList.tsx:456` | | 1 | — |
| 6.2-22 | 6.2 | Pill menu: Jump to a specific date… (date picker) | Not started (later phase) | Comment `MessageList.tsx:459`: "Jump to a specific date comes later"; `api-contract.md:78`; no `around=` route | Menu item, date picker and an `around`/date jump endpoint. Spec section 12 puts "jump to date" in Phase 3 | 3 | M |
| 6.2-23 | 6.2 | Grouping: previous rendered message has the same author | Done | `messageRows.ts:26` (`prev.senderId === next.senderId`); `prev` skips dropped deleted rows (`:70,80`); test `messageRows.test.ts:23` | | 1 | — |
| 6.2-24 | 6.2 | Grouping: same day section | Done | `messageRows.ts:27,72,79`; test `messageRows.test.ts:26` (23:58 vs 00:01) | | 1 | — |
| 6.2-25 | 6.2 | Grouping: at most 5 minutes earlier | Done | `messageRows.ts:10,28-29`; test `messageRows.test.ts:18-22` (10:05 groups, 10:05:01 does not) | | 1 | — |
| 6.2-26 | 6.2 | Grouping: neither is a system message | Done | `messageRows.ts:16-17,30-31`; test `messageRows.test.ts:51` | | 1 | — |
| 6.2-27 | 6.2 | Grouping: neither is a broadcast thread reply | Done | `messageRows.ts:17` (`broadcast`); test `messageRows.test.ts:32` | | 1 | — |
| 6.2-28 | 6.2 | Grouping: previous message has no thread replies | Done | `messageRows.ts:33`; test `messageRows.test.ts:29` | | 1 | — |
| 6.2-29 | 6.2 | A continuation has no avatar or name | Done | `ChannelMessage.tsx:247-257` (empty gutter, name is sr-only); test `ChannelMessage.test.tsx:153` | | 1 | — |
| 6.2-30 | 6.2 | A continuation shows its time in the gutter on hover, 12px | Done | `ChannelMessage.tsx:248` (`invisible ... group-hover:visible`, time is `sf-meta` 12/16, `pt-[3px]`, `text-end`) | | 1 | — |
| 6.2-31 | 6.2 | "New" line before the first message with `seq` > `last_read_seq` at open | Different from spec | `messageRows.ts:52,74-78` (`unread()`: someone else's, not a system message); test `messageRows.test.ts:78,126` | Built before the first unread message from someone else. My own and system messages never take the line. Consistent with the unread count, but not what the spec says and not recorded as a ruling | 1 | S |
| 6.2-32 | 6.2 | New line style: 1px `accent-fill` rule, "New" in `accent`, 12/600 | Different from spec | `MessageList.tsx:506-513` (`h-6`, rule `h-px bg-sf-accent-fill` then "New", `text-[12px]/[16px] font-semibold text-sf-accent`) | [app check] Inset is `px-4` (16px) at every width; `.sf-newdiv` is `padding: 0 var(--space-6)` (24px), which is also the desktop message gutter. Rule and label otherwise match | 1 | S |
| 6.2-33 | 6.2 | The New line stays until the viewer leaves the channel | Partial | State is `useChannelReadState` (`readState.ts:44`) and `useState(channel.unreadCount)` (`ChannelPage.tsx:363-364`) inside `PaneFeed`, which is only mounted on the Messages tab (`ChannelPage.tsx:126-131`) | [app: confirmed. #general reopened shows the New line; after Files, then Messages, it is gone] Going to Files, Pins or Page and back remounts `PaneFeed`: the New line and the unread count are re-read from `channel.lastReadSeq`, which opening already moved to the newest, so the line and bar disappear without leaving the channel. . (Only the Mark-unread hold survives, via `useReadHold`.) Fix: keep the opened-at marker in a store keyed by channel and cleared by `useReadHoldScope` | 1 | S |
| 6.2-34 | 6.2 | Opening the channel marks it read, up to its newest message at that moment | Done | `readState.ts:48-63` (`readOnOpen = channel.lastSeq`, sent once per visit, waits for a visible page); tests `readState.test.tsx` | | 1 | — |
| 6.2-35 | 6.2 | The New line and the bar still show where the viewer left off | Done | `readState.ts:44` (`newAfterSeq` taken at open), `ChannelPage.tsx:363,381-385` (`markedSeq` is told so the list doesn't resend) | See 6.2-33 for the tab-switch hole | 1 | — |
| 6.2-36 | 6.2 | Not marked read while held by Mark unread (U) | Done | `readState.ts:10-14,49,56`; `MessageList.tsx:307-311` (`holdRead`); browser test `MessageList.browser.test.tsx:314` | | 1 | — |
| 6.2-37 | 6.2 | Messages arriving while open are marked read when the newest is visible and the window is focused | Done | `MessageList.tsx:287-311`; `markRead.ts:13-16` (`readUpTo`: at bottom, visible, focused, settled); test `MessageList.browser.test.tsx:307` | | 1 | — |
| 6.2-38 | 6.2 | Unread bar shown when opening with more than one screen of unread | Done | `MessageList.tsx:243-248` (from the New line down is taller than the viewport, then `setBar(true)`), `:384`; test `MessageList.browser.test.tsx:234` | | 1 | — |
| 6.2-39 | 6.2 | Bar text "N new messages since 9:03 PM · Mark as unread" | Done | `MessageList.tsx:385-401`: "{n} new messages since {time}" with "Mark as unread" underlined at the end (the reference `.sf-unreadbar button{margin-left:auto}` places it there); 32px, `accent-fill`, 13/18 500 as `.sf-unreadbar` | | 1 | — |
| 6.2-40 | 6.2 | Mark as unread puts the first new message back to unread, held until the viewer leaves | Done | `MessageList.tsx:344-345,390-401` (`firstNew`), `readState.ts:76-90`; test `MessageList.browser.test.tsx:284` | | 1 | — |
| 6.2-41 | 6.2 | Jump to latest: centred `accent-fill` pill, 12px above the composer | Done | `MessageList.tsx:428-443` (`bottom-3` = 12px inside the list wrapper, `justify-center`, 32px, `rounded-sf-full`, `bg-sf-accent-fill`, `shadow-sf-menu`, 13/18 500) | | 1 | — |
| 6.2-42 | 6.2 | Jump to latest appears when the viewer is more than one screen up | Done | `MessageList.tsx:200` (`far = distance > clientHeight`), `:428` (also while a jump has newer pages unloaded) | | 1 | — |
| 6.2-43 | 6.2 | Jump to latest includes the count when new messages arrived meanwhile | Done | `MessageList.tsx:347,440` ("Jump to latest · N new", others' messages after `seenSeq`); test `MessageList.browser.test.tsx:200` | | 1 | — |
| 6.2-44 | 6.2 | Optimistic send: render at once with "Sending…" as the time | Done | `MessageList.tsx:30-36,110-119` (pending rows), `ChannelMessage.tsx:179` | | 1 | — |
| 6.2-45 | 6.2 | Reconcile on the server ack using a client-generated id | Done | `ChannelPage.tsx:158` (`crypto.randomUUID()` as `clientId`); `MessageList.tsx:110-114` drops a pending row once a message with its `clientId` arrives; server idempotent by (sender, clientId), `api-contract.md:151` | | 1 | — |
| 6.2-46 | 6.2 | On failure: alert icon and "Not sent. Retry · Delete" in `accent` | Done | `ChannelMessage.tsx:275-287` (`IconAlertCircle` 16, `text-sf-accent`, 12/16 medium, underlined Retry and Delete), body muted `:200`; test `ChannelMessage.test.tsx:298` | | 1 | — |
| 6.2-47 | 6.2 | Queue sends while offline, in order | Done | `src/lib/sendQueue.ts:37-87` (per-channel order, waits offline, backoff 1s to 30s, `wake`); tests `src/lib/sendQueue.test.ts:36,48` | | 1 | — |
| 6.2-48 | 6.2 | AC: grouping unit tests cover the 5-minute and day boundaries | Done | `src/pages/chat/messageRows.test.ts:18-22` (5 min), `:26-28` (day), plus author, thread, broadcast, card, system | | 1 | — |
| 6.2-49 | 6.2 | AC: scroll position preserved when older messages load | Done | Browser test `MessageList.browser.test.tsx:168-186` | | 1 | — |
| 6.3-01 | 6.3 | 36px rounded-square avatar | Done | `ChannelMessage.tsx:252` (`Avatar` default `lg` = `size-sf-avatar` 36px, `rounded-sf-md`, `src/components/sf/Avatar.tsx:7`); grid `[var(--size-avatar)_minmax(0,1fr)] gap-x-3` `:241` | | 1 | — |
| 6.3-02 | 6.3 | Author in `body-strong` | Done | `MessageParts.tsx:33` (`sf-body-strong`, 600 14/22 in `src/index.css:329`) | | 1 | — |
| 6.3-03 | 6.3 | Author opens a profile card | Done | `MessageParts.tsx:26-85` (`Popover` with `ProfileCard`: face, presence, title, email, Message); test `ChannelMessage.test.tsx:180` | | 1 | — |
| 6.3-04 | 6.3 | Time in `meta`/`text-muted` | Done | `ChannelMessage.tsx:178` (`sf-meta text-sf-text-muted tabular-nums`) | | 1 | — |
| 6.3-05 | 6.3 | Full date in the tooltip and in `datetime` | Partial | `ChannelMessage.tsx:176-178` (`dateTime={createdAt}`, `title={full}` = "29 Oct 2026, 2:00 PM") | `datetime` is right. The tooltip is a native `title`, not the sf `Tooltip` (500ms delay, ink style, spec 6.15), and has no weekday | 1 | S |
| 6.3-06 | 6.3 | Tag: App | Not started (later phase) | `Avatar` has an `app` prop (`Avatar.tsx:55`) and `Tag` exists (`Badge.tsx:22`), but `ChannelMessage.tsx:252-257` never uses either; `User` has no app/bot kind (`src/api/types.ts:8`) | Apps and Flowbot arrive with Phase 4 (Apps) and Phase 3 (Remind me DMs) | 4 | S |
| 6.3-07 | 6.3 | Tag: Guest | Missing | No author tag in `ChannelMessage.tsx:255-259`; `User` has no guest flag (`types.ts:8`); `tasks/todo.md:666` defers "guests (accepting, the guest role, what guests see)" to their own slice | Add a guest flag to the user model and a `Tag` beside the time. The invite-as-guest part is Phase 2, so this is due there | 2 | M |
| 6.3-08 | 6.3 | Tag: External | Missing | Not built; "External" is not defined anywhere else in the spec (not in the data model section 7, not in section 13) | Needs a definition first (a person from outside the workspace? a shared channel?), then a flag and a `Tag` | 2 | M |
| 6.3-09 | 6.3 | Anatomy order: author + time + tags, then body | Done | `ChannelMessage.tsx:255-268` (header row, then the body) | | 1 | — |
| 6.3-10 | 6.3 | Attachments after the body | Done | `ChannelMessage.tsx:201` (`MessageFiles`) | | 2 | — |
| 6.3-11 | 6.3 | Reactions after attachments | Done | `ChannelMessage.tsx:288-290` (`Reactions`, hidden for deleted, system and pending rows) | | 2 | — |
| 6.3-12 | 6.3 | Thread summary last | Done | `ChannelMessage.tsx:291`; `MessageParts.tsx:180-` | | 2 | — |
| 6.3-13 | 6.3 | Body: paragraphs | Done | `src/pages/chat/MessageBody.tsx:157-162` | | 1 | — |
| 6.3-14 | 6.3 | Body: bold | Done | `MessageBody.tsx:91` (600, never 700) | | 1 | — |
| 6.3-15 | 6.3 | Body: italic | Done | `MessageBody.tsx:92` | | 1 | — |
| 6.3-16 | 6.3 | Body: underline | Done | `MessageBody.tsx:93` | | 1 | — |
| 6.3-17 | 6.3 | Body: strikethrough | Done | `MessageBody.tsx:94` | | 1 | — |
| 6.3-18 | 6.3 | Links in `accent` | Done | `MessageBody.tsx:107-112` (`text-sf-accent`, new tab, `noopener noreferrer`); test `ChannelMessage.test.tsx:90` | | 1 | — |
| 6.3-19 | 6.3 | URL unfurls (title, description, image) for allowed domains | Done | `MessageParts.tsx:274-` (`LinkPreviewCard`); allowed list `src/lib/linkPreview.ts:7-12` (fixed list, "an admin setting can replace it later"); test `ChannelMessage.test.tsx:258` | | 1 | — |
| 6.3-20 | 6.3 | Inline `code`: 13px mono, `surface-sunken`, 1px `line`, `radius-sm` | Done | `MessageBody.tsx:95` (`sf-code` 13/20 mono, `rounded-sf-sm border border-sf-line bg-sf-surface-sunken px-1`) | | 1 | — |
| 6.3-21 | 6.3 | Code blocks: `radius-md`, no syntax colour | Done | `MessageBody.tsx:163-168` (`rounded-sf-md`, `whitespace-pre-wrap`, `dir="ltr"`, plain text) | | 1 | — |
| 6.3-22 | 6.3 | Quotes with a 4px `line` bar | Done | `MessageBody.tsx:169-174` (`border-s-4 border-sf-line ps-3 text-sf-text-secondary`) | | 1 | — |
| 6.3-23 | 6.3 | Lists | Done | `MessageBody.tsx:175-184` (bullet and numbered) | | 1 | — |
| 6.3-24 | 6.3 | Mention pills: `surface-mention` background, `accent` text, 500 | Done | `MessageBody.tsx:25,113-128` (also `@all` and `@KEY`) | | 1 | — |
| 6.3-25 | 6.3 | Channel links | Done | `MessageBody.tsx:129-134` (`#name` link in `accent`) | | 1 | — |
| 6.3-26 | 6.3 | Emoji | Done | Native glyphs in text (`sf-emoji` class for the emoji font, `src/index.css:376`) | | 1 | — |
| 6.3-27 | 6.3 | Jumbo emoji when the message is emoji only | Done | `MessageBody.tsx:212` (`isJumbo` gives 32/40); test `ChannelMessage.test.tsx:113` | | 1 | — |
| 6.3-28 | 6.3 | Task token `^[A-Z][A-Z0-9]+-\d+$` with a visible project's key renders as a chip | Done | `src/lib/messageBody.ts:28` (`TASK_KEY`), `MessageBody.tsx:135-138` (chip only when the key is in `ctx.tasks`, which `useBodyContext.ts:25-28` filters to projects I can see; others stay text); test `ChannelMessage.test.tsx:103` | | 1 | — |
| 6.3-29 | 6.3 | Chip style: 12/500 mono, `surface-sunken`, 1px `line`, `radius-sm` | Done | `MessageBody.tsx:53` (same as `.sf-ref`) | | 1 | — |
| 6.3-30 | 6.3 | Chip status dot: open = hollow Ink 400 ring, in review = Warning, done = Success | Done | `MessageBody.tsx:28-37` (by status category: todo hollow ring, inProgress warning, done success) | Review and in-progress share Warning because tasks have 3 categories (`types.ts:29`) | 1 | — |
| 6.3-31 | 6.3 | Hover on a chip shows a task card | Different from spec | `MessageBody.tsx:50` (`Tooltip` with the title and "KEY · status · project") | An ink tooltip of text, not a card (no assignee, no card surface). [app check] against the artboard | 1 | S |
| 6.3-32 | 6.3 | Clicking a chip opens the task | Done | `MessageBody.tsx:41-44,51-52` (opens the task inspector, keeps the page's query) | | 1 | — |
| 6.3-33 | 6.3 | First reference also renders an unfurl card: icon, title, key · status · project, assignee avatar | Done | `MessageBody.tsx:63-86,191-195`; `ChannelMessage.tsx:196,203` (max 520px, `rounded-sf-lg`, 36px icon tile, status dot, `Avatar size="md"`) | | 1 | — |
| 6.3-34 | 6.3 | Task status is live, not a snapshot | Done | `useBodyContext.ts:20-29` (`useTaskRefs`, looked up at render, refreshed by task events) | | 1 | — |
| 6.3-35 | 6.3 | State: default | Done | `ChannelMessage.tsx:240-245` | | 1 | — |
| 6.3-36 | 6.3 | State: hover (`surface-hover`, shows the toolbar) | Done | `ChannelMessage.tsx:210` (`hover:bg-sf-surface-hover`), `:294-310` (`MessageToolbar` on hover and focus) | | 1 | — |
| 6.3-37 | 6.3 | State: mention of the viewer (`surface-mention` row) | Done | `ChannelMessage.tsx:51,209-213` (me or `@all`; muted text steps up to secondary for contrast); test `ChannelMessage.test.tsx:120` | | 1 | — |
| 6.3-38 | 6.3 | State: selected (`surface-selected`) while its thread is open or after a jump | Done | `MessageList.tsx:130-140` (`selectionOf`), `ChannelMessage.tsx:210`; test `ChannelMessage.test.tsx:128` | | 1 | — |
| 6.3-39 | 6.3 | Selected fades over 600ms after 2s | Done | `MessageList.tsx:28,135-139` (`SELECTED_MS = 2000`, then `fading`), `ChannelMessage.tsx:241` (`duration-[600ms]`) | | 1 | — |
| 6.3-40 | 6.3 | State: edited, "(edited)" in `meta` after the body | Partial | `ChannelMessage.tsx:200` passes a `<span class="sf-meta text-sf-text-muted">` as `after`; `MessageBody.tsx:213-214` puts it after the block paragraphs | [app check] A span after block `<p>`s lands on its own line under the body. The reference `.sf-edited` has `margin-left: space-1`, i.e. inline after the last line. No margin is applied | 1 | S |
| 6.3-41 | 6.3 | State: deleted, "This message was deleted." in `text-muted` with a trash icon | Done | `ChannelMessage.tsx:185-191` (`IconTrash` 16, `text-sf-text-muted`); test `ChannelMessage.test.tsx:140` | | 1 | — |
| 6.3-42 | 6.3 | Deleted shows only when the message has replies, otherwise removed | Done | `messageRows.ts:69-70`; test `messageRows.test.ts:103` | | 1 | — |
| 6.3-43 | 6.3 | System message styling: `small`/`text-secondary` | Done | `ChannelMessage.tsx:192` (`sf-small leading-[22px] text-sf-text-secondary`, as `.sf-msg--system`); test `ChannelMessage.test.tsx:146` | | 1 | — |
| 6.3-44 | 6.3 | System message: joined | Done | `ChannelMessage.tsx:32-33` ("joined the channel.") | | 1 | — |
| 6.3-45 | 6.3 | System message: left | Done | `ChannelMessage.tsx:34-35` | | 1 | — |
| 6.3-46 | 6.3 | System message: renamed | Done | `ChannelMessage.tsx:36-37` | | 1 | — |
| 6.3-47 | 6.3 | System message: topic changed | Done | `ChannelMessage.tsx:38-39` (and "cleared the topic.") | | 1 | — |
| 6.3-48 | 6.3 | System message: pinned | Not started (later phase) | `SystemEvent` in `src/api/types.ts:211-` has no `pinned` kind (it has `added` and `removed` instead) | Comes with Pin (Pins tab, P key). The Pin action itself is Phase 3 | 3 | S |
| 6.3-49 | 6.3 | Edit in place: opened from the menu | Done | `src/pages/chat/MessageActions.tsx:115-117` ("Edit message", E); test `ChannelMessage.test.tsx:583-` | | 1 | — |
| 6.3-50 | 6.3 | Edit in place: opened with E | Done | `ChannelMessage.tsx:219-229` (E on the focused row) | | 1 | — |
| 6.3-51 | 6.3 | Edit in place: Up in an empty composer edits the viewer's last message | Done | `ChannelPage.tsx:161-165` (`onEditLast`), `messageRights.ts:20-22` (`lastEditable`); browser test `RichComposer.browser.test.tsx:279-302` | | 1 | — |
| 6.3-52 | 6.3 | Edit in place: body becomes a mini composer with Cancel and Save | Done | `ChannelMessage.tsx:321-347` (`EditBox` over `RichComposer mode="edit"`), `RichComposer.tsx:389-397` ("Cancel", "Save" / "Saving…") | | 1 | — |
| 6.3-53 | 6.3 | Edit hint "Esc to cancel · Enter to save" | Done | `src/pages/chat/composer/RichComposer.tsx:377` (hidden under 640px); test `RichComposer.browser.test.tsx:255` | | 1 | — |
| 6.3-54 | 6.3 | Edit: author only | Done | `messageRights.ts:11-13` (`edit: own`, never on cards); test `messageRights.test.ts` | | 1 | — |
| 6.3-55 | 6.3 | Edit: admins can set an edit window (default: no limit) | OPEN (section 13 item 8) | No edit-window setting or check anywhere (grep `editWindow`: none); today there is no limit, which equals the spec's default | The setting waits on open question 8 ("Edit window default and message retention policy") | 4 | M |
| 6.3-56 | 6.3 | Delete: author or admin | Done | `messageRights.ts:12-13` (`remove: own \|\| (admin && !card)`) | | 1 | — |
| 6.3-57 | 6.3 | Delete: confirm when the message has replies or files | Done | `messageRights.ts:17` (`deleteNeedsConfirm`), `MessageActions.tsx:119-131,148-165` ("Delete message?") | | 1 | — |
| 6.3-58 | 6.3 | Delete: otherwise at once with a "Message deleted · Undo" toast for 5s | Done | `MessageActions.tsx:74-80` (`message: 'Message deleted'`, action "Undo"); `src/components/sf/Toast.tsx:7` (`TOAST_MS = 5000`) | | 1 | — |
| 6.3-59 | 6.3 | Delete: soft delete, Undo restores within the window | Done | `api-contract.md:158-166` (row kept with `deletedAt`; restore within 10s server side); `useRestoreMessage` (`MessageActions.tsx:64,79`) | | 1 | — |
| 6.3-60 | 6.3 | AC: keyboard users can reach every action | Done | Toolbar is a Tab stop and the row handles E, U, L, T (`ChannelMessage.tsx:219-239`); `a11y.browser.test.tsx`; actions are in 6.4 and 6.5 | | 1 | — |
| 6.3-61 | 6.3 | AC: screen readers hear author, time, body, reactions in that order | Done | DOM order `ChannelMessage.tsx:255-293` (header with author then time, body, files, reactions, thread summary); a continuation keeps an sr-only header (`:255-257`); test `ChannelMessage.test.tsx:153` | | 1 | — |

#### Notes

- **Sticky date pill**: the spec's model is one section per day with a CSS-sticky pill that the next day's pill pushes out. The build uses a flat virtualized list plus a separate `aria-hidden` overlay that copies the pill (`MessageList.tsx:336-341,404-411`). More than one pill can show: the in-flow dividers of later days show alongside the sticky one (also true in the spec's model), and in two places the build adds an unintended second one (6.2-12). There is no test for the sticky pill (grep for sticky in tests: none).
- **Tab switch loses the New line** (6.2-33): `PaneFeed` and its read state live under the Messages tab only. This is likely the most user-visible bug in my sections. A browser test should open a channel with unread messages, go to Files and back, and expect the New line.
- **Grouping is stricter than the spec** (`messageRows.ts:16-17`): task-event cards, comment cards and deleted placeholders also stand alone. The spec lists only system messages and broadcast replies. This is a sensible addition and is tested, but it isn't recorded as a ruling.
- **Staleness**: `buildRows` is called with `now: new Date()` inside a `useMemo` whose dependencies don't include time (`MessageList.tsx:116-119`), so "Today" and "Yesterday" labels stay as of the last message change across midnight.
- **Failed send reason**: the server's reason ("Not sent." plus detail from `api-contract.md:151`) is only in a `title` attribute on the line (`ChannelMessage.tsx:276`). It isn't visible on touch or read by screen readers.
- **Header test coverage**: header and tabs are well covered by `ChannelHeader.test.tsx`. Nothing covers header layout at 1024-1279px or the truncation order (the AC items are code-read only).
- **Phase placement of tabs**: spec section 12 Phase 1 asks for "Messages functional; the other tabs as stubs", which is what is built (6.1-20, 6.1-21, 6.1-23 are Done as stubs). Their content, count, separator, bookmarks and "+" are Phase 3 (Pins, Files, bookmarks) and Phase 4 (Page).
- **Tags** (6.3-06 to 6.3-08): none of App, Guest, External is rendered and the user model carries none of them. The `Tag` and `Avatar app` primitives are ready. "External" has no definition in the spec.

### Audit C: FLOW_CHAT_REDESIGN.md §6.4 Message toolbar, §6.5 Message menu, §6.6 Reactions and emoji picker, §6.7 Threads

Compared with `design/spark-flow-components.reference.css` (`sf-msgbar`, `sf-menu`, `sf-react`, `sf-emoji`, `sf-thread`, `sf-panel`) and `src/styles/flow-tokens.css`. Read only; nothing was run in a browser, so layout and hover items carry `[app check]`.

Rulings cited (from `tasks/todo.md`): slice 1 scope and rulings at lines 358 and 372; threads slice rulings at line 462.

| ID | Section | Requirement | Status | Evidence | Gap | Phase | Effort |
|---|---|---|---|---|---|---|---|
| 6.4-01 | 6.4 Toolbar | Floats at the top-end of the hovered or focused row | Done | `MessageToolbar.tsx:206` (`absolute z-[var(--z-toolbar)]`), `ChannelMessage.tsx:308` (`end-4 md:end-6`), shown by `group-hover` and `group-has-[:focus-visible]` at `MessageToolbar.tsx:210` | | 2 | — |
| 6.4-02 | 6.4 Toolbar | Sits 16px above the row's top edge | Done | `RISE = 16` (`MessageToolbar.tsx:20`), `-top-4` default (`:207`), `placeToolbar` tries `-RISE` first (`:47`) | [app check] It deliberately drops lower (fully above the row, or inside it) when 16px would cover the name or time, or be clipped. | 2 | — |
| 6.4-03 | 6.4 Toolbar | On `surface-raised` with `shadow-toolbar` (radius-lg, 2px padding, 2px gap) | Done | `MessageToolbar.tsx:206` `rounded-sf-lg bg-sf-surface-raised p-0.5 gap-0.5 shadow-sf-toolbar`, same as reference line 165; tokens in `flow-tokens.css:53,76` | | 2 | — |
| 6.4-04 | 6.4 Toolbar | Buttons are 32px | Done | `size-sf-control` (`MessageToolbar.tsx:223`) and `IconButton` md (`Button.tsx:60`), `--size-control: 32px`; quick-reaction glyph 16px (`:225`) as in reference line 167 | | 2 | — |
| 6.4-05 | 6.4 Toolbar | 1px × 20px divider between reactions and actions (reference `sf-msgbar-sep`) | Done | `MessageToolbar.tsx:230` | | 2 | — |
| 6.4-06 | 6.4 Toolbar | Buttons have tooltips that show shortcuts | Done | `IconButton` wraps `Tooltip` with `Kbd` (`Button.tsx:111`, `Tooltip.tsx:96-103`); Reply in thread passes `shortcut={['T']}` (`MessageToolbar.tsx:231`); quick reactions show `:alias:` (`:216`) | Only Reply in thread has a key to show today; Save for later (S) is its own item. | 2 | — |
| 6.4-07 | 6.4 Toolbar | Quick reaction ✅ | Done | `QUICK_REACTIONS` (`MessageToolbar.tsx:18`), toggle with `aria-pressed` and `surface-mention` when mine (`:214-228`); test `MessageToolbar.test.tsx:71` | | 2 | — |
| 6.4-08 | 6.4 Toolbar | Quick reaction 👀 | Done | Same list, `MessageToolbar.tsx:18` | | 2 | — |
| 6.4-09 | 6.4 Toolbar | Quick reaction 🙌 | Done | Same list, `MessageToolbar.tsx:18` | | 2 | — |
| 6.4-10 | 6.4 Toolbar | Later: quick reactions become the viewer's three most recent | Not started (later phase) | Fixed `['✅','👀','🙌']` (`MessageToolbar.tsx:18`); ruling `todo.md:372` keeps them fixed. `recentEmoji()` (`lib/emoji.ts`) is a per-browser list that could feed it | Spec says "later" and §12 does not schedule it. | n/a (not in §12) | S |
| 6.4-11 | 6.4 Toolbar | Add reaction button (opens the emoji picker) | Done | `AddReaction` with `IconMoodPlus` (`MessageToolbar.tsx:229`, `:239-252`); test `MessageToolbar.test.tsx:93` | | 2 | — |
| 6.4-12 | 6.4 Toolbar | Reply in thread (T) button | Done | `MessageToolbar.tsx:231` with `shortcut={['T']}`; key T handled at `ChannelMessage.tsx:235`; opens the thread with the reply box focused (`useReplyFocus`); test `MessageToolbar.test.tsx:80` | Shown only on top-level messages where the viewer may post. | 2 | — |
| 6.4-13 | 6.4 Toolbar | Forward button | Missing | Not in `MessageToolbar.tsx`; no forward code anywhere in `src`. Deferred by slice-1 scope (`todo.md:358`: "hidden until their own slices") and no later slice delivered it | §12 Phase 2 says "all items except Remind". No spec detail on the flow (pick channel or DM, quote, link) so it needs a short design first. | 2 | M |
| 6.4-14 | 6.4 Toolbar | Save for later (S) button, with S key and tooltip | Missing | Not in `MessageToolbar.tsx`; no `S` handler in `ChannelMessage.tsx:219-239`. `todo.md:358` and `:752` defer it with Saved | §12 puts the toolbar in Phase 2 but "Saved items" in Phase 3, so the button has nothing to save into until the Saved model exists. Needs `Saved` data and route plus S key. | 2 (target view: 3) | M |
| 6.4-15 | 6.4 Toolbar | More (⋮) button | Done | `IconDotsVertical`, "More actions" (`MessageToolbar.tsx:232`) | | 2 | — |
| 6.4-16 | 6.4 Toolbar | Stays visible while any of its menus is open | Done | `has-[[aria-expanded=true]]:opacity-100` (`MessageToolbar.tsx:210`); browser test `a11y.browser.test.tsx:415` | | 2 | — |
| 6.4-17 | 6.4 Toolbar | OPEN: AI action ("Summarize thread" / "Ask about this message") | OPEN | Correctly not built (no AI button in `MessageToolbar.tsx`); §13 question 1; `todo.md:358` | Blocked on §13 Q1. | n/a | — |
| 6.4-18 | 6.4 Toolbar | AC: never covers the author name when opened by keyboard | Done | `placeToolbar` measures the row's name and time (`ROW_HEADER`) and moves clear (`MessageToolbar.tsx:33-48`); placed on `focusin` (`:108-109`); browser tests `a11y.browser.test.tsx:415`, `:467` | [app check] The spec says "the row below"; the toolbar rises above its own row, so the code protects its own row's name and time (and bars laid over the list, `LIST_OVERLAY`). | 2 | — |
| 6.4-19 | 6.4 Toolbar | AC: reachable with Tab | Done | `role="toolbar"`, one Tab stop per row (`MessageToolbar.tsx:181-182`); test `MessageToolbar.test.tsx:49` | | 2 | — |
| 6.4-20 | 6.4 Toolbar | AC: reachable with the arrow keys | Done | ←/→ (RTL aware), Home, End (`MessageToolbar.tsx:184-195`); test `MessageToolbar.test.tsx:55` | | 2 | — |
| 6.4-21 | 6.4 Toolbar | AC: Enter opens it | Done | Native `<button>`s: Enter on More opens the menu, on Add reaction opens the picker (`Menu.tsx:77-83`, `Popover.tsx:39`) | | 2 | — |
| 6.5-01 | 6.5 Menu | Items in spec order, separators only between groups that have items | Done | `groups` array with `MenuSeparator` (`MessageActions.tsx:90-147`); test `MessageActions.test.tsx:52`, `:82` | Order is correct for what is built; Remind me, Pin and App actions are absent (own items). | 2 | — |
| 6.5-02 | 6.5 Menu | Get notified about replies | Done | `FollowItem` (`MessageActions.tsx:15-21`, used `:93`); only on top-level messages (`ChannelMessage.tsx:159-162`); test `ChannelMessage.test.tsx:519` | | 2 | — |
| 6.5-03 | 6.5 Menu | "Turn off" while following | Done | Label "Turn off notifications for replies" with `IconBellOff` (`MessageActions.tsx:17-18`); test `ChannelMessage.test.tsx:531` | Wording is the slice's choice ("the same wording everywhere", `todo.md:462`); spec only says "Turn off". | 2 | — |
| 6.5-04 | 6.5 Menu | Mark unread (U) | Done | `MessageActions.tsx:94-98` with hint `U` and `aria-keyshortcuts` (`Menu.tsx:277`); key U on the row (`ChannelMessage.tsx:229`); test `MessageActions.test.tsx:99` | Offered on someone else's settled messages in the channel list only (`ChannelMessage.tsx:148-151`), not in the thread panel. | 2 | — |
| 6.5-05 | 6.5 Menu | Remind me ▸ (submenu row) | Not started (later phase) | Not in `MessageActions.tsx`. The `Submenu` primitive exists (`Menu.tsx:300`) but nothing uses it for messages; `todo.md:358` "Remind me is Phase 3" | Needs the reminder model, scheduler and the Flowbot DM. | 3 | L |
| 6.5-06 | 6.5 Menu | Separator after the first group | Done | `MenuSeparator` between non-empty groups (`MessageActions.tsx:141`, `Menu.tsx:361`) | | 2 | — |
| 6.5-07 | 6.5 Menu | Create task from message (item in the menu) | Different from spec (approved ruling: only on a project's channel, `todo.md:372`) | `useTaskFromMessage.tsx:16-35`: item reads "Create task", only when the channel is a project's and the viewer has `task.manage`; passed in as `extra` (`MessageActions.tsx:101`) | Not offered in ordinary channels or DMs. Label is "Create task" (spec heading says "Create task from message"; §0 names list "Create task"). | 2 | M |
| 6.5-08 | 6.5 Menu | Create task prefills the title | Done | `taskDraft` first line, max 120 (`taskDraft.ts:10-14`); test `taskDraft.test.ts` | | 2 | — |
| 6.5-09 | 6.5 Menu | Create task prefills the description | Done | `taskDraft` whole text with mentions as names (`taskDraft.ts:12-14`) | | 2 | — |
| 6.5-10 | 6.5 Menu | Create task links the message | Done | `linkedChannelId` and `linkedMessageId` in the draft (`taskDraft.ts:13`); the task chip shows under the message (`ChannelMessage.tsx:202`, `MessageParts.tsx:212`) | A broadcast row offers none (`canMakeTask`, `taskDraft.ts:7`). | 2 | — |
| 6.5-11 | 6.5 Menu | Create task lets the viewer pick the project | Different from spec (approved ruling: project is fixed to the channel, `todo.md:372`) | `TaskSheet project={project}` uses the channel's project (`useTaskFromMessage.tsx:36-45`) | Needs `POST /tasks/from-message` plus a project picker; ruling says it waits on that route. | 2 | M |
| 6.5-12 | 6.5 Menu | Pin to channel (P) | Missing | Not in `MessageActions.tsx`; no P key in `ChannelMessage.tsx:219-239`; no pin field in `api/types.ts`. Deferred by `todo.md:358` | §12 Phase 2 says "all items except Remind", but the Pins tab and "pinned" system message are Phase 3, so this is mostly data plus a system message. | 2 | M |
| 6.5-13 | 6.5 Menu | Copy link (L) | Done | `MessageActions.tsx:102-106`; `copyLink` (`ChannelMessage.tsx:155`); key L (`:232`); test `ChannelMessage.test.tsx:397` | | 2 | — |
| 6.5-14 | 6.5 Menu | Copy text | Done | `MessageActions.tsx:107-111`; `copyText` (`ChannelMessage.tsx:156`) | | 2 | — |
| 6.5-15 | 6.5 Menu | Separator, then author or admin only items | Done | Group 4 holds Edit and Delete, shown by `can.edit` / `can.remove` (`MessageActions.tsx:113-131`, `messageRights.ts:13-16`) | | 2 | — |
| 6.5-16 | 6.5 Menu | Edit message (E), author only | Done | `MessageActions.tsx:114-118` hint `E`; `can.edit` is own, non-card (`messageRights.ts:14-15`); key E (`ChannelMessage.tsx:226`) | The admin edit window is §13 Q8 (not this section). | 2 | — |
| 6.5-17 | 6.5 Menu | Delete message in `accent` | Done | `danger` row uses `text-sf-accent` and `hover:bg-sf-surface-mention` (`MessageActions.tsx:119-129`, `Menu.tsx:236-238`); matches reference lines 203-204 | | 2 | — |
| 6.5-18 | 6.5 Menu | Delete for author or admin | Done | `remove: own \|\| (admin && !card)` (`messageRights.ts:16`) | | 2 | — |
| 6.5-19 | 6.5 Menu | Delete confirms per 6.3 (replies or files), else at once with Undo | Done | `deleteNeedsConfirm` (`messageRights.ts:20`), `Modal` confirm (`MessageActions.tsx:148-163`), 5s Undo toast (`TOAST_MS = 5000`, `Toast.tsx:7`; `MessageActions.tsx:76-80`); tests `MessageActions.test.tsx:129-158` | | 2 | — |
| 6.5-20 | 6.5 Menu | App actions, if any, at the end | Not started (later phase) | No app-action slot in `MessageActions.tsx` (`extra` carries only Create task) | Apps and interactive messages are Phase 4. | 4 | M |
| 6.5-21 | 6.5 Remind me | Option: In 20 minutes | Not started (later phase) | Nothing built | Phase 3 | 3 | S |
| 6.5-22 | 6.5 Remind me | Option: In 1 hour | Not started (later phase) | Nothing built | Phase 3 | 3 | S |
| 6.5-23 | 6.5 Remind me | Option: In 3 hours | Not started (later phase) | Nothing built | Phase 3 | 3 | S |
| 6.5-24 | 6.5 Remind me | Option: Tomorrow (9:00 AM) | Not started (later phase) | Nothing built | Phase 3 | 3 | S |
| 6.5-25 | 6.5 Remind me | Option: Next week (Mon 9:00 AM) | Not started (later phase) | Nothing built | Phase 3 | 3 | S |
| 6.5-26 | 6.5 Remind me | Separator before Custom… | Not started (later phase) | Nothing built | Phase 3 | 3 | S |
| 6.5-27 | 6.5 Remind me | Option: Custom… (date and time picker) | Not started (later phase) | Nothing built | Phase 3 | 3 | M |
| 6.5-28 | 6.5 Remind me | When it fires, Flowbot sends a DM | Not started (later phase) | No reminder data, scheduler or Flowbot user in `api/types.ts` or `src/mocks` | Phase 3 | 3 | L |
| 6.5-29 | 6.5 Remind me | The DM carries the message preview | Not started (later phase) | Nothing built | Phase 3 | 3 | S |
| 6.5-30 | 6.5 Remind me | The DM carries a link | Not started (later phase) | Nothing built | Phase 3 | 3 | S |
| 6.5-31 | 6.5 Remind me | The DM has Mark complete | Not started (later phase) | Nothing built | Phase 3 | 3 | M |
| 6.5-32 | 6.5 Remind me | The DM has Snooze | Not started (later phase) | Nothing built | Phase 3 | 3 | M |
| 6.5-33 | 6.5 Remind me | Reminders also appear in Saved | Not started (later phase) | Saved view not built (`todo.md:752`); sidebar entry hidden behind `chatRedesign` | Phase 3 | 3 | M |
| 6.5-34 | 6.5 Menu rules | 32px rows | Done | `h-8` (`Menu.tsx:236`; phones `h-11`) | | 2 | — |
| 6.5-35 | 6.5 Menu rules | 8px inset | Done | `mx-2` on items (`Menu.tsx:235`), `py-2` on the panel (`:221`) | | 2 | — |
| 6.5-36 | 6.5 Menu rules | `radius-md` highlight in `surface-hover` | Done | `rounded-sf-md hover:bg-sf-surface-hover focus:bg-sf-surface-hover` (`Menu.tsx:235-239`) | | 2 | — |
| 6.5-37 | 6.5 Menu rules | Shortcut hints in `meta` / `text-muted` | Done | `sf-meta ms-auto … text-sf-text-muted` (`Menu.tsx:289-293`) | | 2 | — |
| 6.5-38 | 6.5 Menu rules | Submenus open to the end side | Done | `MenuPanel side` places at `anchor.right` (`Menu.tsx:141-145`), RTL aware | The message menu has no submenu yet (Remind me). | 2 | — |
| 6.5-39 | 6.5 Menu rules | Submenus flip to the start when there is no room | Done | `endFits ? toEnd : toStart` (`Menu.tsx:143-145`) | Primitive only, no message-menu consumer. | 2 | — |
| 6.5-40 | 6.5 Menu rules | Arrow keys move between items | Done | `Menu.tsx:178-181`; test `layers.test.tsx` | | 2 | — |
| 6.5-41 | 6.5 Menu rules | Enter selects | Done | Items are native `<button>`s with `onClick` (`Menu.tsx:272-285`) | | 2 | — |
| 6.5-42 | 6.5 Menu rules | Right opens a submenu | Done | `Submenu` `onKeyDown` (`Menu.tsx:337-343`, RTL aware) | | 2 | — |
| 6.5-43 | 6.5 Menu rules | Left or Esc closes a submenu | Done | Left: `back && side` (`Menu.tsx:182`); Esc: `useEscapeLayer` closes the top-most level (`:130`) | | 2 | — |
| 6.5-44 | 6.5 Menu rules | Typing a letter jumps to the matching item | Done | `Menu.tsx:183-202` (prefix typing, then item key, then first letter) | | 2 | — |
| 6.5-45 | 6.5 Menu rules | Focus returns to the trigger on close | Done | `closeAll` focuses the trigger (`Menu.tsx:65-68`); Esc and outside press use it (`:93-94`) | | 2 | — |
| 6.5-46 | 6.5 Menu rules | Panel look: min-width 260, radius-lg, `shadow-menu`, 1px `line` separators | Done | `min-w-[260px] rounded-sf-lg shadow-sf-menu` (`Menu.tsx:220-225`), `MenuSeparator` (`:361-363`); reference lines 199 and 207 | | 2 | — |
| 6.6-01 | 6.6 Reactions | Chip is 24px high | Done | `h-6` (`MessageParts.tsx:109`) | | 2 | — |
| 6.6-02 | 6.6 Reactions | Chip `radius-full`, 1px `line` | Done | `rounded-sf-full border border-sf-line` (`MessageParts.tsx:109-110`) | | 2 | — |
| 6.6-03 | 6.6 Reactions | Emoji 14px | Done | `sf-emoji text-[14px]/none` (`MessageParts.tsx:114`) | | 2 | — |
| 6.6-04 | 6.6 Reactions | Count 12/500 | Done | `text-[12px]/[16px] font-medium tabular-nums` (`MessageParts.tsx:109-110`) | | 2 | — |
| 6.6-05 | 6.6 Reactions | Others' reactions: `surface` fill, `text-secondary`, hover border `line-strong` | Done | `MessageParts.tsx:110`, `:128`; matches reference lines 185-186 | | 2 | — |
| 6.6-06 | 6.6 Reactions | Own reaction: `surface-mention` fill | Done | `bg-sf-surface-mention` (`MessageParts.tsx:110`) | | 2 | — |
| 6.6-07 | 6.6 Reactions | Own reaction: `accent` border | Done | `border-sf-accent` (`MessageParts.tsx:110`) | | 2 | — |
| 6.6-08 | 6.6 Reactions | Own reaction: `accent` count, weight 600 | Done | `font-semibold text-sf-accent` (`MessageParts.tsx:110`) | | 2 | — |
| 6.6-09 | 6.6 Reactions | Own reaction has `aria-pressed="true"` | Done | `aria-pressed={mine}` (`MessageParts.tsx:124`); the quick reactions do the same (`MessageToolbar.tsx:221`) | | 2 | — |
| 6.6-10 | 6.6 Reactions | Hover tooltip is dark | Done | `Tooltip` is `bg-sf-ink-950` (`Tooltip.tsx:94`), used at `MessageParts.tsx:121` | Shows after the 500ms hover delay (spec 6.15). Chips on read-only rows (no post right) use a native `title` instead (`MessageParts.tsx:134`). | 2 | — |
| 6.6-11 | 6.6 Reactions | Tooltip: large emoji | Done | 28px emoji (`MessageParts.tsx:103-105`) | | 2 | — |
| 6.6-12 | 6.6 Reactions | Tooltip: "You and Hossam Gaber" (who reacted) | Done | `reactorsText` (`lib/reactions.ts:25-30`: "You and X", "You, X and 2 others"); test `reactions.test.ts` | | 2 | — |
| 6.6-13 | 6.6 Reactions | Tooltip: ":thumbsup:" | Done | `sub={alias && ':alias:'}` from `emojiInfo` (`MessageParts.tsx:101,121`) | | 2 | — |
| 6.6-14 | 6.6 Reactions | Add chip with mood-plus icon (32×24) | Done | `IconMoodPlus` 16px, `h-6 w-8` (`MessageParts.tsx:150-155`); reference line 189 | | 2 | — |
| 6.6-15 | 6.6 Reactions | Add chip appears only while the row is hovered | Done | `hidden group-focus-within:block group-hover:block has-[[aria-expanded=true]]:block` (`MessageParts.tsx:143`) | [app check] It also shows on keyboard focus or with its picker open. It exists only once a message has a reaction (`MessageParts.tsx:95`); the toolbar's Add reaction covers the first one. | 2 | — |
| 6.6-16 | 6.6 Rules | One reaction per (message, user, emoji) | Done | `toggleReaction` (`lib/reactions.ts:14-19`) is the one rule used by mock and optimistic update; mock `mocks/chat.ts:484` | Backend must enforce the unique key (spec §7); contract `api-contract.md:120`. | 2 | — |
| 6.6-17 | 6.6 Rules | At most 50 distinct emoji per message | Done | `MAX_DISTINCT_REACTIONS = 50` (`lib/reactions.ts:7,16`); mock 400 "This message has 50 different reactions already." (`mocks/chat.ts:485`); error shown (`MessageParts.tsx:170-174`, `MessageToolbar.tsx:125-130`) | | 2 | — |
| 6.6-18 | 6.6 Rules | Optimistic toggle | Done | `useReact` `onMutate` updates every cached shape, rolls back on error (`api/chat.ts:183-197`) | | 2 | — |
| 6.6-19 | 6.6 Rules | Real-time update to every viewer | Done | Mock publishes `messageChanged` (`mocks/chat.ts:490`); `RealtimeBridge.tsx:23` invalidates | The SignalR client is a placeholder when the backend is on (`lib/realtime.ts:64-67,84`), so this works on the mock hub only until the backend lands. | 2 | — |
| 6.6-20 | 6.6 Picker | Size 352×412 | Done | `h-[412px] w-[352px]` (`EmojiPicker.tsx:118`), popover `w-[352px]` (`MessageToolbar.tsx:241`) | | 2 | — |
| 6.6-21 | 6.6 Picker | Search field | Done | 36px, `border-line-strong`, radius-md, 18px icon, Enter picks first match, ↓ enters the grid (`EmojiPicker.tsx:119-142`); reference line 281 | | 2 | — |
| 6.6-22 | 6.6 Picker | Category tabs: Frequently used, Smileys & people, Nature, Food, Activities, Travel, Objects, Symbols, Flags | Done | Nine sections (`EmojiPicker.tsx:19-29,48-52`; labels in `lib/emoji.ts:10-360`); tabs scroll to their section and follow scroll (`:103-114`) | | 2 | — |
| 6.6-23 | 6.6 Picker | Tab look: 2px `accent-fill` bar under the active tab, top-only radius | Different from spec | `IconButton size="sm" pressed` (`EmojiPicker.tsx:146`): 28px, radius-md all round, `surface-hover` fill when active (`Button.tsx:60,103`). Reference lines 282-284: 32px tabs, `radius-md md 0 0`, `inset 0 -2px 0 accent-fill` | [app check] Active tab has no accent underline. | 2 | S |
| 6.6-24 | 6.6 Picker | Custom category tab (after Flags) | Missing | None. `EmojiPicker.tsx:38` says custom emoji "come later"; no ruling in `todo.md`; no custom-emoji data or upload in `api/types.ts` | §12 does not schedule it, so it falls in Phase 2 with the picker. Needs a decision first (workspace emoji upload, admin only?). | 2 | L |
| 6.6-25 | 6.6 Picker | 9-column grid | Done | `grid grid-cols-9` (`EmojiPicker.tsx:156`) | | 2 | — |
| 6.6-26 | 6.6 Picker | 36px cells | Done | `h-9 … text-[22px]/none` (`EmojiPicker.tsx:173`) | | 2 | — |
| 6.6-27 | 6.6 Picker | Footer preview: name | Done | `preview.name` 13/500 (`EmojiPicker.tsx:191`) | | 2 | — |
| 6.6-28 | 6.6 Picker | Footer preview: aliases | Done | `:alias:` list (`EmojiPicker.tsx:192`) | | 2 | — |
| 6.6-29 | 6.6 Picker | Footer preview: skin tone | Missing | None. `EmojiPicker.tsx:38` defers skin tones; no ruling in `todo.md`. The contract already accepts skin-tone emoji (`lib/emojiText.ts`) | No skin-tone chooser, and no tone variants in `lib/emoji.ts`. | 2 | M |
| 6.6-30 | 6.6 Picker | Footer look: 52px, top border, `surface-sunken`, 28px glyph | Done | `h-[52px] border-t border-sf-line bg-sf-surface-sunken`, 28px glyph (`EmojiPicker.tsx:184-188`); reference line 290 | | 2 | — |
| 6.6-31 | 6.6 Picker | Anchored to the trigger | Done | `Popover` `Panel` + `placeBelow` (`Popover.tsx:69-75`, `layers.tsx:105-114`) | | 2 | — |
| 6.6-32 | 6.6 Picker | Flips above when there is no room | Done | `anchor.top - panel.height - 4` (`layers.tsx:112`) | | 2 | — |
| 6.6-33 | 6.6 Picker | Arrow keys move through the grid | Done | ←/→/↑/↓, Home, End, RTL aware, roving tab stop (`EmojiPicker.tsx:81-90,165`); test `EmojiPicker.test.tsx:55` | | 2 | — |
| 6.6-34 | 6.6 Picker | Typing focuses search | Done | A letter typed on a cell goes to search (`EmojiPicker.tsx:94-100`); search takes focus on open (`Popover.tsx:79-81`) | | 2 | — |
| 6.7-01 | 6.7 Summary | Summary bar under the parent | Done | `ThreadSummary` (`MessageParts.tsx:180-209`), rendered when `threadCount > 0` (`ChannelMessage.tsx:291`); geometry (32px, `min-w-[min(420px,100%)]`, radius-md, `-ms-1`) matches reference line 190 | | 2 | — |
| 6.7-02 | 6.7 Summary | Up to 5 reply avatars | Different from spec | `.slice(0, 3)` (`MessageParts.tsx:184`); the mock already returns up to 5 (`mocks/chat.ts:64,108`; contract `api-contract.md:105`) | Shows 3, spec says up to 5. | 2 | S |
| 6.7-03 | 6.7 Summary | Reply avatars are 20px | Done | `Avatar size="sm"` = `--size-avatar-sm: 20px` (`Avatar.tsx:4`, `flow-tokens.css:95`) | | 2 | — |
| 6.7-04 | 6.7 Summary | "N replies" in `accent` 13/600 | Done | `text-[13px]/[18px] font-semibold text-sf-accent`; "1 reply" singular (`MessageParts.tsx:182,197`) | | 2 | — |
| 6.7-05 | 6.7 Summary | "Last reply 5 days ago" | Different from spec | `Last reply ${timeAgo(...)}` gives "5d ago", "3h ago", "25 min ago" (`MessageParts.tsx:183`, `lib/format.ts:15-26`) | Copy is abbreviated; spec reads "5 days ago". | 2 | S |
| 6.7-06 | 6.7 Summary | "Last reply today at 9:41 AM" for same-day replies | Different from spec | Same code path; a reply from today reads "Last reply 3h ago", never "today at 9:41 AM" | Needs a day-aware formatter (today at time, else N days ago). | 2 | S |
| 6.7-07 | 6.7 Summary | On hover the meta text becomes "View thread ›" | Done | `group-hover/thread:hidden` on meta, `group-hover/thread:inline-flex` on "View thread" with a flipped chevron (`MessageParts.tsx:198-206`); reference lines 194-196 | | 2 | — |
| 6.7-08 | 6.7 Summary | On hover the bar takes a `line` border on `surface-raised` | Done | `hover:border-sf-line hover:bg-sf-surface-raised` (`MessageParts.tsx:188`) | | 2 | — |
| 6.7-09 | 6.7 Panel | Panel is 420px wide | Different from spec (approved ruling: the panel stays 384px, `todo.md:462`) | `sm:w-[24rem]` (`InspectorFrame.tsx:34`); `--size-panel: 420px` exists but is unused | Width is 384px, not 420px. | 2 | S |
| 6.7-10 | 6.7 Panel | Header shows "Thread" as the title | Different from spec | Title is the parent's first line; "Thread" is a small uppercase accent eyebrow (`ThreadInspector.tsx:57-59`, `InspectorFrame.tsx:37-40`). Reference: "Thread" 16/24 600 (`sf-panel-title`, line 333) | Header text hierarchy is inverted. | 2 | S |
| 6.7-11 | 6.7 Panel | Header shows "#channel" | Different from spec | Rendered as "Thread · #channel" in the eyebrow (`ThreadInspector.tsx:57`), uppercase, `text-accent`. Reference: 13/18 muted `sf-panel-sub` (line 334) | Should be a muted subline after the title. | 2 | S |
| 6.7-12 | 6.7 Panel | Header ⋮ menu | Done | `ThreadMenu` in the `actions` slot (`ThreadInspector.tsx:129-135`, `InspectorFrame.tsx:41`); test `ThreadMenu.test.tsx:28` | | 2 | — |
| 6.7-13 | 6.7 Panel | ⋮ Copy link | Done | `ThreadMenu.tsx:38-40`; says "Link copied" on screen and read out; test `ThreadMenu.test.tsx:42` | | 2 | — |
| 6.7-14 | 6.7 Panel | ⋮ Follow or unfollow | Done | `FollowItem` (`ThreadMenu.tsx:41`); test `ThreadMenu.test.tsx:33` | | 2 | — |
| 6.7-15 | 6.7 Panel | ⋮ Mute | Different from spec (approved ruling: no Mute in the header menu, `todo.md:462`) | Not in `ThreadMenu.tsx:37-45` | Mute thread is omitted. | 2 | M |
| 6.7-16 | 6.7 Panel | ⋮ Open in a new window | Done | `window.open(link, '_blank', 'noopener')` (`ThreadMenu.tsx:42-44`); test `ThreadMenu.test.tsx:57` | | 2 | — |
| 6.7-17 | 6.7 Panel | Close button | Done | `aria-label="Close thread"` (`InspectorFrame.tsx:42`); Esc also closes (`Inspector.tsx:28-46`) | A plain lucide `X`, not an `sf` `IconButton` with a tooltip (see 6.7-18). | 2 | — |
| 6.7-18 | 6.7 Panel | Panel chrome follows `sf-panel` (flat column, `border-left` line, `--size-header` header, 16/24 title) | Different from spec | `InspectorFrame` is the CRM help-panel frame: lucide `X`, legacy tokens (`bg-surface`, `border-line`, `text-fg-muted`), `px-5 py-4` header, rounded floating card at xl (`InspectorFrame.tsx:34-46`) | [app check] Mixes legacy tokens into an `sf` surface; reference `sf-panel` lines 331-335. | 2 | M |
| 6.7-19 | 6.7 Panel | Body: the parent message | Done | `ChannelMessage … showThread={false} compact` (`ThreadInspector.tsx:72-74`) | | 2 | — |
| 6.7-20 | 6.7 Panel | Body: "N replies" divider | Different from spec | Present (`ThreadInspector.tsx:75-80`) but 12px `text-xs text-fg-muted` with `bg-line-subtle` and `my-3`; reference `sf-replydiv`: 32px row, 13/18 muted, `px-4`, `line` rule (line 336). Shows "0 replies" when empty | [app check] Legacy tokens and size. | 2 | S |
| 6.7-21 | 6.7 Panel | Body: the replies | Done | `ThreadInspector.tsx:88-103`, grouped with `canContinue` (`messageRows.ts:26-40`) | | 2 | — |
| 6.7-22 | 6.7 Panel | Body: a thread composer | Done | `ThreadComposer` (`ThreadInspector.tsx:113-119`); Join channel and read-only lines in its place when needed (`:106-122`) | | 2 | — |
| 6.7-23 | 6.7 Panel | Composer has no formatting row by default | Done | `showFormatting={false}` (`ThreadComposer.tsx:47`); browser test `ThreadComposer.browser.test.tsx` | | 2 | — |
| 6.7-24 | 6.7 Panel | Composer adds "Also send to #channel" checkbox | Done | `Checkbox` "Also send to {sendTo}" (`ThreadComposer.tsx:65-67`), unchecked after each send (`:35,50`); a DM reads the people | | 2 | — |
| 6.7-25 | 6.7 Broadcast | A reply sent with the checkbox also appears in the channel | Done | `postReply … alsoInChannel` makes one record listed in the channel with `broadcast` (`mocks/chat.ts:788-790`; contract `api-contract.md:196-200`) | | 2 | — |
| 6.7-26 | 6.7 Broadcast | Channel row is labelled "replied to a thread:" plus a link to the parent's first line | Done | `ChannelMessage.tsx:260-267` using `broadcast.rootText`; test `ChannelMessage.test.tsx:546` | | 2 | — |
| 6.7-27 | 6.7 Broadcast | It doesn't group with neighbouring messages | Done | `standsAlone` includes `broadcast` (`messageRows.ts:14-16`) | | 2 | — |
| 6.7-28 | 6.7 Broadcast | In the panel it shows "↪ Also sent to #channel" | Done | `ChannelMessage.tsx:269-274`; test `ChannelMessage.test.tsx:574-579` | | 2 | — |
| 6.7-29 | 6.7 Following | The author follows automatically | Done | `follows()` (`mocks/chat.ts:73-77`) | Rule lives in the mock; the backend must implement it (contract `api-contract.md:183`). | 2 | — |
| 6.7-30 | 6.7 Following | Repliers follow automatically | Done | `replies.some(r => r.senderId === userId …)` (`mocks/chat.ts:76`) | | 2 | — |
| 6.7-31 | 6.7 Following | Anyone mentioned follows automatically | Done | `namesUser` (`mocks/chat.ts:67,76`); `@all` does not count | | 2 | — |
| 6.7-32 | 6.7 Following | Manual follow | Done | "Get notified about replies" in the ⋯ menu and the panel ⋮ (`MessageActions.tsx:15-21`, `ThreadMenu.tsx:41`); `PUT /api/messages/:id/follow` | | 2 | — |
| 6.7-33 | 6.7 Following | Manual unfollow | Done | Same item flips to "Turn off notifications for replies"; `DELETE …/follow` (`mocks/chat.ts:597-605`) | | 2 | — |
| 6.7-34 | 6.7 Following | Followed threads with new replies count toward Activity | Done | A reply makes Activity items for followers (`mocks/chat.ts:802-806`; contract `api-contract.md:245`); Activity slice `todo.md:504-536` | | 2 | — |
| 6.7-35 | 6.7 Following | …and toward Threads (sidebar) | Not started (later phase) | Sidebar link only behind the `chatRedesign` flag (`Sidebar.tsx:305-309`); no `/threads` route in `router.tsx`; `todo.md:462` "Threads come later" | Threads view and its counts are Phase 3. | 3 | L |
| 6.7-36 | 6.7 Rule | Threads are one level only | Done | Mock refuses a reply to a broadcast reply (`mocks/chat.ts:602,773`); UI gives replies no Reply in thread or summary (`ChannelMessage.tsx:103-104,169-171`); contract `api-contract.md:182` | | 2 | — |
| 6.7-37 | 6.7 AC | Opening a thread marks its parent `surface-selected` | Done | `selectionOf` → `'on'` while `?thread=` names the message (`MessageList.tsx:130-140`); `bg-sf-surface-selected` (`ChannelMessage.tsx:209-210`); test `ChannelMessage.test.tsx:130` | | 2 | — |
| 6.7-38 | 6.7 AC | Closing the panel restores the channel's width | Done | At xl the panel is a flex sibling (`xl:relative xl:shrink-0`, `InspectorFrame.tsx:34`) so the channel returns to full width on close; below xl it overlays | [app check] No test of the width. | 2 | — |
| 6.7-39 | 6.7 AC | Closing the panel restores the channel's scroll position | Partial | No code or test for it. The list uses `anchorTo: 'end'` (`MessageList.tsx:158`), which keeps the distance from the end while rows reflow | [app check] Scroll mid-list, open then close a thread at xl, compare the first visible row. Add a browser test in `MessageList.browser.test.tsx`. | 2 | S |

#### Notes

- Counts and gaps that need a decision from you: Forward (6.4-13), Save for later (6.4-14), Pin to channel (6.5-12), Custom emoji tab (6.6-24) and skin tone (6.6-29) have no approved ruling that moves them out of Phase 2. `todo.md:358` only says they are "hidden until their own slices", and no later slice picked them up. §12 puts Saved items and the Pins tab in Phase 3, so Save for later and Pin are partly blocked by Phase 3 data.
- The thread panel is the weakest match to the reference. It reuses `InspectorFrame` (the Spark CRM help-panel frame, `src/layout/InspectorFrame.tsx`), so the header hierarchy (6.7-10, 6.7-11), the divider (6.7-20) and the chrome (6.7-18) use legacy tokens and sizes. The width ruling (384px) is recorded; the rest is not.
- Emoji picker: the set is a curated list (about 340 emoji, `lib/emoji.ts:6`), not the full Unicode set, so search and the grid cannot reach an emoji outside it; "Frequently used" is per browser (`localStorage` key `spark-flow.emoji.recent`), not per account.
- Spec §8 lists reactions as `PUT` and `DELETE /messages/:id/reactions/:emoji` (spec line 573); the contract uses one toggling `POST /api/messages/:id/reactions` (`api-contract.md:120`). Not in my sections, but the backend team should know which one wins.
- With `VITE_BACKEND=on` the realtime client is an unconnected placeholder (`lib/realtime.ts:64-67`), so reactions, follows and thread counts update live only on the mock hub today.
- `ThreadSummary` uses `timeAgo` from `lib/format.ts` ("5d ago"); that formatter follows the repo-wide CRM rule. The spec's chat copy ("5 days ago", "today at 9:41 AM") needs a chat-specific formatter.
- Read-only rows (no post right) show reaction chips with a native `title` instead of the dark tooltip (`MessageParts.tsx:134`); small, not scored as its own item.
- The toolbar and ⋮ menu have good test cover (`MessageToolbar.test.tsx`, `MessageActions.test.tsx`, `a11y.browser.test.tsx` including axe in both themes). Threads have tests for the menu, composer and broadcast rows but none for the summary's hover state or the panel header.
- Phones and touch tablets use only the ⋯ and a sheet instead of the toolbar (`MessageToolbar.tsx:132-176`); that belongs to §6.16 (Phase 4) and was not scored here.

### Audit D: FLOW_CHAT_REDESIGN.md §6.8 Composer (lines 362–419) and §6.9 Files, snippets and voice/video messages (420–446)

Reference CSS checked: `sf-composer`, `sf-fmtbar`, `sf-editor`, `sf-cbar`, `sf-send`, `sf-typing`, `sf-tray`, `sf-att`, `sf-progress`, `sf-file*`, `sf-image`, `sf-clip`, `sf-ac*` (docs/flow-chat/design/spark-flow-components.reference.css lines 211–279).
Paths are under `src/pages/chat/` unless they start with `src/`.

| ID | Section | Requirement | Status | Evidence | Gap | Phase | Effort |
|---|---|---|---|---|---|---|---|
| 6.8-01 | 6.8 Anatomy | Attachment tray first in the box, only when files are pending | Done | composer/RichComposer.tsx:291 `{files?.tray}` before the format row; uploads/UploadTray.tsx:82 returns null when empty | | 2 | — |
| 6.8-02 | 6.8 Anatomy | Composer box: 1px `line-strong` border, `radius-lg`, `surface` background | Done | composer/RichComposer.tsx:287-289 (`rounded-sf-lg border bg-sf-surface border-sf-line-strong`) | | 1 | — |
| 6.8-03 | 6.8 Format row | Bold button (⌘B tooltip) | Done | composer/FormatBar.tsx:83; pressed state from caret :35 | | 1 | — |
| 6.8-04 | 6.8 Format row | Italic button (⌘I) | Done | composer/FormatBar.tsx:84 | | 1 | — |
| 6.8-05 | 6.8 Format row | Underline button (⌘U) | Done | composer/FormatBar.tsx:85; tooltip drops ⌘U in boxes that take files (see 6.8-43) | | 1 | — |
| 6.8-06 | 6.8 Format row | Strikethrough button (⌘⇧X) | Done | composer/FormatBar.tsx:86 | | 1 | — |
| 6.8-07 | 6.8 Format row | Link button (⌘K) | Done | composer/FormatBar.tsx:88; link bar composer/RichComposer.tsx:424-486 (address, Save link, Remove link, Cancel) | | 1 | — |
| 6.8-08 | 6.8 Format row | Numbered list button | Done | composer/FormatBar.tsx:90 (toggles off when already a numbered list) | | 1 | — |
| 6.8-09 | 6.8 Format row | Bulleted list button | Done | composer/FormatBar.tsx:91 | | 1 | — |
| 6.8-10 | 6.8 Format row | Quote button | Done | composer/FormatBar.tsx:93 | | 1 | — |
| 6.8-11 | 6.8 Format row | Code (inline) button | Done | composer/FormatBar.tsx:94 | | 1 | — |
| 6.8-12 | 6.8 Format row | Code block button | Done | composer/FormatBar.tsx:95 | | 1 | — |
| 6.8-13 | 6.8 Format row | Three 1×16px separators: after strikethrough, after link, after lists | Done | composer/FormatBar.tsx:80,87,89,92 (`mx-1 h-4 w-px bg-sf-line`) matches `.sf-fmt-sep` | | 1 | — |
| 6.8-14 | 6.8 Format row | Row layout: 28px buttons, 18px icons, 2px gap, padding 4 4 0 | Done | composer/FormatBar.tsx:82 (`gap-0.5 px-1 pt-1`); IconButton size sm = `size-7`, icon 18 (components/sf/Button.tsx:60,108) | | 1 | — |
| 6.8-15 | 6.8 Editor | Placeholder "Message #channel" | Done | ChannelPage.tsx:110,153 (`Message ${title}`, title = `#name`); composer/RichComposer.tsx:301 | | 1 | — |
| 6.8-16 | 6.8 Editor | Placeholder "Message Nour El-Sayed" in a DM | Done | ChannelPage.tsx:110 `channelLabel(current, people, persona.id)` → placeholder :153 | | 1 | — |
| 6.8-17 | 6.8 Editor | Editor sizing: min 38px, max 50vh, 14/22, padding 8 12 | Different from spec | composer/RichComposer.tsx:302 (`max-h-[40vh] min-h-[38px] px-3 py-2 sf-body`) vs `.sf-editor{max-height:50vh}` | Max height is 40vh, reference is 50vh. Everything else matches. | 1 | S |
| 6.8-18 | 6.8 Action row | + attach button | Done | composer/RichComposer.tsx:325-332 (`IconButton label="Attach"`, only when the box takes files; an edit box has none) | | 2 | — |
| 6.8-19 | 6.8 Action row | + turns into × while its menu is open | Done | composer/RichComposer.tsx:328 (`props['aria-expanded'] ? IconX : IconPlus`); browser test RichComposer.browser.test.tsx:326 | | 2 | — |
| 6.8-20 | 6.8 Action row | + styled as `sf-plus`: round, `surface-hover` fill; open = `text` fill with `surface` icon | Different from spec | composer/RichComposer.tsx:328 is a plain muted 28px square IconButton (`rounded-sf-md`, no fill); no open-state fill | Not round, no `surface-hover` background; the open state only swaps the icon, with no inverted fill. | 2 | S |
| 6.8-21 | 6.8 Action row | Aa formatting toggle | Done | composer/RichComposer.tsx:347 (`IconLetterCase`, `pressed`, label Show/Hide formatting); channel box starts with the row, thread box without (:103, ThreadComposer.tsx:47); test :307-320 | | 1 | — |
| 6.8-22 | 6.8 Action row | Emoji button opens the picker and inserts at the caret | Done | composer/RichComposer.tsx:348-362 (Popover + EmojiPicker, `$insertNodes`) | | 1 | — |
| 6.8-23 | 6.8 Action row | @ button | Done | composer/RichComposer.tsx:363-373 inserts " @" and the typeahead opens | Minor: always inserts a leading space, so a second space appears when the caret already follows one. | 1 | S |
| 6.8-24 | 6.8 Action row | Separator between the + / Aa / emoji / @ group and the video / voice group, and another before / | Not started (later phase) | Nothing renders `.sf-cbar-sep`; composer/RichComposer.tsx:324-375 has one group only | Arrives with the video, voice and / buttons. | 4 | S |
| 6.8-25 | 6.8 Action row | Video message button | Not started (later phase) | no match for video message anywhere in src | | 4 | L |
| 6.8-26 | 6.8 Action row | Voice message button | Not started (later phase) | no match for voice message anywhere in src | | 4 | L |
| 6.8-27 | 6.8 Action row | / shortcuts button | Not started (later phase) | no match for slash or shortcuts menu in composer/ | | 3 | M |
| 6.8-28 | 6.8 Action row | Hint "Shift + Enter for a new line", only while there is text | Done | composer/RichComposer.tsx:383 (`!empty && …`, hidden below `sm`); it gives way to "Drop to add files" or the upload note (:378-381) | | 1 | — |
| 6.8-29 | 6.8 Action row | Send button at the end: `accent-fill`, 28px tall (36px wide), 16px icon, `radius-md` | Different from spec | composer/RichComposer.tsx:400-411: one `size-8` (32px) square button, `IconSend` at 18px, no tooltip, no `cursor-not-allowed` when disabled | Size is 32×32 with an 18px icon, where the reference is 28 high and 36 wide with a 16px icon. Disabled cursor is the default one. | 1 | S |
| 6.8-30 | 6.8 Action row | Split Send: a Schedule chevron (24px, left divider) beside Send | Not started (later phase) | single button only, composer/RichComposer.tsx:400. `components/sf/SplitButton.tsx` exists but is a different 28px outlined control and isn't used here | | 3 | M |
| 6.8-31 | 6.8 Action row | Row spacing: padding 0 8 8 4, 2px gap | Different from spec | composer/RichComposer.tsx:324 (`gap-0.5 px-1 pb-1`) vs `.sf-cbar{padding:0 8px 8px 4px}` | [app check] Right and bottom padding are 4px, reference is 8px. | 1 | S |
| 6.8-32 | 6.8 States | Border `line-strong`, becoming `text-secondary` on focus (150ms ease) | Done | composer/RichComposer.tsx:287-288 (`focus-within:border-sf-text-secondary`, `duration-150 ease-sf`) | | 1 | — |
| 6.8-33 | 6.8 States | Formatting icons go from `text-muted` to `text-secondary` on focus | Different from spec | composer/FormatBar.tsx:64-78 uses `tone="muted"` always (hover goes to `text`). The box is `group/composer` (RichComposer.tsx:287) but nothing reads it (no `group-focus-within/composer:` class in src) | Icons stay `text-muted` while the editor has focus. | 1 | S |
| 6.8-34 | 6.8 States | Send disabled (transparent, `text-muted`) when empty | Done | composer/RichComposer.tsx:201,407 (`bg-transparent text-sf-text-muted`); test :76 | | 1 | — |
| 6.8-35 | 6.8 States | With text or a pending attachment Send uses `accent-fill` | Done | composer/RichComposer.tsx:201,407. A ready file sends with no text. While a file is still uploading (or failed) Send stays off and the row says "Uploading 2 files…" (approved slice 6 plan, tasks/todo.md:735 "Send waits for uploads") | | 2 | — |
| 6.8-36 | 6.8 States | The Send chevron opens the Schedule menu | Not started (later phase) | see 6.8-30 | | 3 | M |
| 6.8-37 | 6.8 States | Below 560px the trailing actions collapse into "…" | Not started (later phase) | no breakpoint logic in composer/RichComposer.tsx; only the hint hides below `sm` (:383) | Nothing to collapse yet beyond Aa / emoji / @; belongs with the mobile composer (§6.16). | 4 | M |
| 6.8-38 | 6.8 States | Bottom-right corner left free of other controls (Send is last) | Done | composer/RichComposer.tsx:374-413 (Send is the last item; code comment cites the extensions rule); the Draft / limit / error lines sit below the box (:416-418) | | 1 | — |
| 6.8-39 | 6.8 Keys | Enter sends | Done | composer/KeysPlugin.tsx:52-63 | | 1 | — |
| 6.8-40 | 6.8 Keys | Enter on a touch screen | Different from spec | composer/KeysPlugin.tsx:60 `if (coarsePointer()) return false` and composerKeys.ts:1-9: on a `(pointer: coarse)` device Enter makes a new line and only Send sends | The spec table says Enter sends and gives no touch exception. No ruling is recorded in tasks/todo.md (grep for coarse / touch screen finds none). | 1 | S |
| 6.8-41 | 6.8 Keys | Shift+Enter new line | Done | composer/KeysPlugin.tsx:56-59 (a new list item inside a list); test RichComposer.browser.test.tsx:65 | | 1 | — |
| 6.8-42 | 6.8 Keys | Up in an empty composer edits my last message | Done | composer/KeysPlugin.tsx:99-110; ChannelPage.tsx:161-165 (`lastEditable`); test :277-305 | | 1 | — |
| 6.8-43 | 6.8 Keys | ⌘/Ctrl+B bold, I italic | Done | Lexical rich-text defaults (composer/RichComposer.tsx:295 `RichTextPlugin`); KeysPlugin leaves them alone (:85 returns false) | [app check] No test presses the keys; only the buttons are tested (:125). | 1 | — |
| 6.8-44 | 6.8 Keys | ⌘/Ctrl+U underline | Different from spec (approved ruling: ⌘/Ctrl+U uploads in boxes that take files; Underline is then the button only, ⌘U still underlines in an edit) | composer/KeysPlugin.tsx:80-84; tasks/todo.md:737; FormatBar.tsx:47,85 | The spec gives ⌘U to both Underline and Upload from your computer; the ruling resolves the clash for Upload. | 1 | — |
| 6.8-45 | 6.8 Keys | ⌘/Ctrl+Shift+X strikethrough | Done | composer/KeysPlugin.tsx:71-74 | | 1 | — |
| 6.8-46 | 6.8 Keys | ⌘/Ctrl+K link | Done | composer/KeysPlugin.tsx:75-79 → `openLink` (RichComposer.tsx:246) | | 1 | — |
| 6.8-47 | 6.8 Keys | ⌘/Ctrl+Shift+Enter text snippet | Not started (later phase) | no handler in KeysPlugin.tsx; Text snippet is Phase 3 | | 3 | M |
| 6.8-48 | 6.8 Keys | Esc closes the open popover | Done | components/sf/Menu.tsx:130 and Popover.tsx:67 (`useEscapeLayer`); autocomplete Esc (test RichComposer.browser.test.tsx:170); link bar Esc (RichComposer.tsx:456) | | 1 | — |
| 6.8-49 | 6.8 Autoformat | `*bold*` | Done | composer/markdown.ts:4,9; test RichComposer.browser.test.tsx:97 | | 1 | — |
| 6.8-50 | 6.8 Autoformat | `_italic_` | Done | composer/markdown.ts:5 (`intraword: false`); same test | | 1 | — |
| 6.8-51 | 6.8 Autoformat | `~strike~` | Done | composer/markdown.ts:6; same test | | 1 | — |
| 6.8-52 | 6.8 Autoformat | `` `code` `` | Done | composer/markdown.ts:9 `INLINE_CODE`; same test | | 1 | — |
| 6.8-53 | 6.8 Autoformat | ```` ``` ```` code block | Done | composer/markdown.ts:9 `CODE` (Lexical's fence transformer, node_modules/@lexical/markdown/src/MarkdownTransformers.ts:225,854) | [app check] No test types a fence. | 1 | — |
| 6.8-54 | 6.8 Autoformat | `> ` quote | Done | composer/markdown.ts:9 `QUOTE`; test :118 | | 1 | — |
| 6.8-55 | 6.8 Autoformat | `1. ` numbered list | Done | composer/markdown.ts:9 `ORDERED_LIST` | [app check] Not covered by a test (only `- ` and `> ` are). | 1 | — |
| 6.8-56 | 6.8 Autoformat | `- ` bulleted list | Done | composer/markdown.ts:9 `UNORDERED_LIST`; test :118 | | 1 | — |
| 6.8-57 | 6.8 Autoformat | Pasting keeps plain structure | Done | composer/KeysPlugin.tsx:127-134 (text/plain only, lines kept via `insertRawText`; test :383 for Word/Excel pastes) | | 1 | — |
| 6.8-58 | 6.8 Autoformat | Pasting auto-links URLs | Done | composer/bodyEditor.ts:90 `autoInlines` turns addresses into links in the sent body (lib/messageBody.ts:95-110); KeysPlugin.tsx:22 comment | The link is made when the message is sent, not while it sits in the box (no AutoLinkPlugin). | 1 | — |
| 6.8-59 | 6.8 Drafts | One draft per (user, channel, thread root) | Done | api/chat.ts:151-157 (`saveDraft(channelId, body, rootId)`); ChannelPage.tsx:443 (rootId null); ThreadComposer.tsx:39,54 (rootId); mocks/chat.ts:651-664 | | 1 | — |
| 6.8-60 | 6.8 Drafts | Autosave with a 500ms debounce | Done | composer/RichComposer.tsx:36,231; test :183-208 (plus save on leaving, and retry after a failure :208) | | 1 | — |
| 6.8-61 | 6.8 Drafts | Stored on the server, synced across devices | Done | `PUT /api/channels/:id/draft` (lib/http.ts:97, api-contract.md:140-145); `draft.updated` → layout/RealtimeBridge.tsx:30 refreshes drafts | An already-open box doesn't adopt a draft changed on another device (it starts from the draft only when it mounts). Fine for the spec as written. | 1 | — |
| 6.8-62 | 6.8 Drafts | Restore on return | Done | ChannelPage.tsx:437-449 (box waits for drafts, starts from `draft?.body`); ThreadComposer.tsx:38-39 | | 1 | — |
| 6.8-63 | 6.8 Drafts | Pencil in the sidebar | Done | layout/Sidebar.tsx:149-153 (`IconPencil`, "draft" for screen readers); layout/useSidebarGroups.ts:20,33 | The pencil shows only when the row has no count and isn't muted. | 1 | — |
| 6.8-64 | 6.8 Drafts (AC) | Drafts survive a reload | Done | the draft is server state; the mock keeps it in the IndexedDB document (mocks/chat.ts:651-664) | [app check] No reload test. | 1 | — |
| 6.8-65 | 6.8 Typing | 20px line under the composer: "Nour El-Sayed is typing…" | Done | ChannelTyping.tsx:12-34 (`h-5`), rendered under the box ChannelPage.tsx:167; typingLine.ts:4-5; send throttled to 2s (RichComposer.tsx:39,233) | | 1 | — |
| 6.8-66 | 6.8 Typing | Name in 600 (`meta` type) | Done | ChannelTyping.tsx:19-23 (`<b className="font-semibold">`), `sf-meta` | | 1 | — |
| 6.8-67 | 6.8 Typing | Three or more people: "Several people are typing…" | Done | typingLine.ts:7; test typingLine.test.ts | | 1 | — |
| 6.8-68 | 6.8 Typing | `.sf-typing` look: `text-secondary`, names in `text`, 24px side inset | Different from spec | ChannelTyping.tsx:19 (`text-sf-text-muted`, `pt-1`, no side padding; names inherit muted) | Colour is `text-muted` (reference `text-secondary`), names are not `text`, no `space-6` inset. | 1 | S |
| 6.8-69 | 6.8 Limit | 40,000 characters | Done | composer/RichComposer.tsx:34,199,201,417 (blocks send; "Keep the message under 40,000 characters."); test :220 | | 1 | — |
| 6.8-70 | 6.8 Limit | Counter in the last 1,000 | Done | composer/RichComposer.tsx:35,385-389 (remaining count, error colour past the limit); test :220 | | 1 | — |
| 6.8-71 | 6.8 Autocomplete | `sf-ac` opens above the composer; 380px, raised surface, menu shadow, 36px rows | Done | composer/AutocompletePlugin.tsx:123-126 (`bottom: innerHeight - box.top + 8`, width `min(380, box.width)`, `rounded-sf-lg bg-sf-surface-raised pt-2 shadow-sf-menu`), rows :139 (`min-h-9 mx-2 rounded-sf-md`) | | 1 | — |
| 6.8-72 | 6.8 Autocomplete | `@` people: avatar, name, presence word | Done | composer/AutocompletePlugin.tsx:159-165 (Avatar with presence, name 500, "Active / Away / Offline" at 13px secondary); test :138 | | 1 | — |
| 6.8-73 | 6.8 Autocomplete | `@` groups | Missing | lib/mentionQuery.ts:30-38 offers @all, people, projects, tasks only; Inline types are user / all / channel / project (composer/bodyEditor.ts:27); spec §7 Mention has `group` (here, channel, usergroup) | No user groups or teams in `@`. Needs a group inline in the body type, the mock and the contract. | 1 | L |
| 6.8-74 | 6.8 Autocomplete | "Not in this channel" label for people outside the channel | Done | composer/AutocompletePlugin.tsx:46,164; useComposerDirectory.ts:19 (`memberIds`); test :153 | | 1 | — |
| 6.8-75 | 6.8 Autocomplete | "Not in this channel" adds a prompt to invite on send | Missing | Nothing in ChannelPage.tsx or composer/ reacts to a non-member mention on send (grep "invite" in composer/ finds nothing) | A non-member mention is only labelled in the list. No "Invite Nour to #backend?" prompt when sending, no add-member call. | 1 | M |
| 6.8-76 | 6.8 Autocomplete | `@here` notifies active members | Missing | no match for `@here` in src or in api-contract.md | | 1 | M |
| 6.8-77 | 6.8 Autocomplete | `@channel` notifies all members | Different from spec | The only everyone mention is `@all` ("Everyone in this channel"): lib/mentionQuery.ts:32, composer/AutocompletePlugin.tsx:169; CLAUDE.md "Mentions" documents `@all` | Spec names it `@channel`; the build has `@all` (from the M3 syntax). Rename or alias, and update `lib/mentions.ts`, the mock and the contract. | 1 | M |
| 6.8-78 | 6.8 Autocomplete | Confirm before sending `@here` or `@channel` to more than 25 members | Missing | no member-count check anywhere on send (ChannelPage.tsx:157-160) | | 1 | S |
| 6.8-79 | 6.8 Autocomplete | `#` channels | Done | composer/AutocompletePlugin.tsx:42,170 (`channelOptions`, starts-with first, then contains); test :161 | | 1 | — |
| 6.8-80 | 6.8 Autocomplete | `:` emoji | Missing | `TRIGGER` only matches `@` and `#` (composer/AutocompletePlugin.tsx:53) | §12 doesn't name `:`; filed under Phase 2 with the emoji picker (a judgement). | 2 | M |
| 6.8-81 | 6.8 Autocomplete | `/` shortcuts list | Not started (later phase) | `TRIGGER` has no `/`; no command registry | | 3 | L |
| 6.8-82 | 6.8 Autocomplete | Arrow keys move; Enter or Tab accept; Esc closes | Done | Lexical typeahead (composer/AutocompletePlugin.tsx:103-155); tests RichComposer.browser.test.tsx:138,161,170 | | 1 | — |
| 6.8-83 | 6.8 Autocomplete | Footer with key hints | Done | composer/AutocompletePlugin.tsx:145-148 ("↑ ↓ move · Enter or Tab choose · Esc close") | [app check] Gap between hints is 4px (reference 8px) and Kbd is 20px (reference `.sf-ac-foot .sf-kbd` 18px). | 1 | S |
| 6.8-84 | 6.8 Autocomplete (AC) | Enter never sends while an autocomplete is open | Done | `menuOpen` ref (composer/AutocompletePlugin.tsx:76; KeysPlugin.tsx:54); test RichComposer.browser.test.tsx:138 | | 1 | — |
| 6.8-85 | 6.8 Autocomplete (AC) | IME composition (Arabic) never triggers a send | Done | composer/KeysPlugin.tsx:55 (`isComposing`, `keyCode 229`); test :87 | | 1 | — |
| 6.8-86 | 6.8 Shortcuts (/) | /remind | Not started (later phase) | no slash command code | Needs Reminders (Phase 3). | 3 | M |
| 6.8-87 | 6.8 Shortcuts (/) | /task (create a Flow task in the channel's linked project) | Not started (later phase) | no slash command code; `useTaskFromMessage.tsx` is the message-menu path | | 3 | M |
| 6.8-88 | 6.8 Shortcuts (/) | /call | Not started (later phase) | no slash command code | Calls are Phase 4 (§6.13), so this command can only land with them. | 3 | M |
| 6.8-89 | 6.8 Shortcuts (/) | /invite | Not started (later phase) | no slash command code; Add people modal exists (ChannelMembers.tsx) | | 3 | S |
| 6.8-90 | 6.8 Shortcuts (/) | /topic | Not started (later phase) | no slash command code; topic editing exists in ChannelDetails | | 3 | S |
| 6.8-91 | 6.8 Shortcuts (/) | /status | Not started (later phase) | no slash command code | | 3 | M |
| 6.8-92 | 6.8 Shortcuts (/) | /mute | Not started (later phase) | no slash command code; `useSetMuted` exists | | 3 | S |
| 6.8-93 | 6.8 Shortcuts (/) | /leave | Not started (later phase) | no slash command code; `useLeaveChannel` exists | | 3 | S |
| 6.8-94 | 6.8 Shortcuts (/) | /search | Not started (later phase) | no slash command code | Needs the Search view (Phase 3). | 3 | S |
| 6.8-95 | 6.8 Shortcuts (/) | /shrug | Not started (later phase) | no slash command code | | 3 | S |
| 6.8-96 | 6.8 Shortcuts (/) | Row shows the command (mono), its arguments (`text-secondary`) and a description | Not started (later phase) | no `.sf-ac-cmd` / `.sf-ac-desc` equivalent | | 3 | S |
| 6.8-97 | 6.8 Shortcuts (/) | Apps can register commands that POST to a URL and answer ephemerally or in the channel | Not started (later phase) | no app-command code or contract | | 3 | L |
| 6.8-98 | 6.8 Attach menu | Upload from your computer (⌘U) | Done | composer/RichComposer.tsx:329-331 (`hint` ⌘U or Ctrl+U, opens the file picker); test :326 | | 2 | — |
| 6.8-99 | 6.8 Attach menu | Add from Flow files | Not started (later phase) | not in the menu (RichComposer.tsx:328-332); tasks/todo.md:752 "Waits" for the Files tab | | 3 | M |
| 6.8-100 | 6.8 Attach menu | Text snippet (⌘⇧↵) | Not started (later phase) | not in the menu; see 6.9 snippet items | | 3 | L |
| 6.8-101 | 6.8 Attach menu | Separator, then Task list | Not started (later phase) | not in the menu | | 4 | L |
| 6.8-102 | 6.8 Attach menu | Task list carries a Pro tag | OPEN | spec §13 item 7 (plan gating: which features are Pro) | | 4 | S |
| 6.8-103 | 6.8 Attach menu | Page | Not started (later phase) | not in the menu; the channel Page tab is Phase 4 | | 4 | L |
| 6.8-104 | 6.8 Attach menu | Run an automation | Not started (later phase) | not in the menu | | 4 | L |
| 6.8-105 | 6.8 Attach menu | Separator, then "Turn on GIFs for your team" (admin only) | Not started (later phase) | not in the menu | | 3 | M |
| 6.8-106 | 6.8 Attach menu | After GIFs are enabled the item becomes a GIF picker | OPEN | spec §13 item 6 (GIF provider and rating) | | 3 | L |
| 6.8-107 | 6.8 Schedule menu | "Schedule message" header | Not started (later phase) | no Schedule menu | | 3 | S |
| 6.8-108 | 6.8 Schedule menu | Tomorrow at 9:00 AM | Not started (later phase) | no Schedule menu | | 3 | S |
| 6.8-109 | 6.8 Schedule menu | Monday at 9:00 AM | Not started (later phase) | no Schedule menu | | 3 | S |
| 6.8-110 | 6.8 Schedule menu | Separator, then Custom time… | Not started (later phase) | no Schedule menu | Needs a date and time picker. | 3 | M |
| 6.8-111 | 6.8 Schedule menu | Note "Times are in <tz>. Scheduled messages are in Drafts & sent." | Not started (later phase) | no Schedule menu; the sidebar's "Drafts & sent" link exists only behind the `chatRedesign` flag (layout/Sidebar.tsx:316) | | 3 | S |
| 6.8-112 | 6.8 Schedule send | Scheduled message is stored, sent at its time, listed in Drafts & sent | Not started (later phase) | no `ScheduledMessage` in api/ or mocks/ | | 3 | L |
| 6.9-01 | 6.9 Tray | 232px cards (sf-att: 8px padding, 1px line, `radius-md`) | Done | uploads/UploadTray.tsx:33 (`w-[232px] flex-none gap-2 rounded-sf-md border border-sf-line p-2`) | [app check] The strip adds 8px more top room than `.sf-tray` so the × isn't clipped (:92). | 2 | — |
| 6.9-02 | 6.9 Tray | Thumbnail or type icon (40px, `surface-sunken`) | Done | uploads/UploadTray.tsx:9-26,34-36 (local object-URL picture for images, otherwise a pdf / photo / video / text icon) | The server's `thumbUrl` isn't used (see 6.9-12). | 2 | — |
| 6.9-03 | 6.9 Tray | Name | Done | uploads/UploadTray.tsx:38 (13/18, 500, truncated) | | 2 | — |
| 6.9-04 | 6.9 Tray | Progress bar, `accent-fill`, 4px | Done | uploads/UploadTray.tsx:40-49 (`h-1`, role progressbar); test UploadTray.test.tsx:17 | | 2 | — |
| 6.9-05 | 6.9 Tray | "PNG · 412 KB" once ready | Done | uploads/UploadTray.tsx:51; lib/fileTypes.ts:64-67 | | 2 | — |
| 6.9-06 | 6.9 Tray | × to remove (20px round, on the corner) | Done | uploads/UploadTray.tsx:64-71 (`size-5 rounded-sf-full bg-sf-text text-sf-surface -end-2 -top-2`); removing cancels the upload (uploads/useUploads.ts:71) | | 2 | — |
| 6.9-07 | 6.9 Tray | Several files send as one message with the text | Done | ChannelPage.tsx:158 (`fileIds: uploads.ready…`, one `enqueue`); ThreadComposer.tsx:48-53; capped at 10 (lib/fileDetails MAX_MESSAGE_FILES, contract line 365) | | 2 | — |
| 6.9-08 | 6.9 Tray | Failed and blocked cards | Done | uploads/UploadTray.tsx:52-61 (reason in `text-sf-error`, Retry; blocked has only ×); useUploads.ts:36-44 | Extra to the spec, in an approved slice 6 review fix. | 2 | — |
| 6.9-09 | 6.9 Upload | Direct to object storage via a presigned URL | Done | lib/http.ts:227-233 (upload-url → PUT bytes with progress → complete); contract api-contract.md:350-352 | The mock simulates it (mocks/files.ts:200-225). | 2 | — |
| 6.9-10 | 6.9 Upload | Server-side MIME sniffing and a virus scan | Done | Client handles `scanStatus` (uploads/useUploads.ts:36-44; MessageFiles.tsx:165-181); contract api-contract.md:336,340,369 | Server work: the mock has no scanner and marks every upload clean (mocks/files.ts:214). | 2 | — |
| 6.9-11 | 6.9 Upload | Size limit is a config value (1 GB suggested) | Done | lib/fileTypes.ts:20 (`VITE_MAX_FILE_MB`, default 25 in the prototype); contract api-contract.md:364 | | 2 | — |
| 6.9-12 | 6.9 Upload | Generate thumbnails | Partial | `thumbUrl` is in the record (api/types.ts:106; contract line 341) but no UI reads it (grep: only `previewUrl` is used, MessageFiles.tsx:196) | Inline images, the tray and the details panel load the full file instead of the small thumbnail. | 2 | S |
| 6.9-13 | 6.9 Upload | Access follows channel membership | Done | mocks/files.ts:6 `canRead`; api-contract.md:366 (Open and Details rule) | | 2 | — |
| 6.9-14 | 6.9 Upload | Downloads use expiring signed URLs | Done | contract api-contract.md:355 (redirect to a short-lived signed address); client opens through `api.files.url` (components/AttachmentView.tsx:10-30) | Server work; the prototype serves blob URLs. | 2 | — |
| 6.9-15 | 6.9 Upload | Drag and drop works everywhere | Partial | ChannelPage.tsx:125 (whole pane, `paneDrop`), ThreadComposer.tsx:41, composer/RichComposer.tsx:259-285 | The edit box takes no files (`files` omitted), and the project Chat tab and task comments still use the old textarea `Composer` (pages/chat/Composer.tsx, used by projects/ChatTab.tsx:49) with no drop. | 2 | S |
| 6.9-16 | 6.9 Upload | Paste-image works everywhere | Partial | composer/KeysPlugin.tsx:111-125 names a pasted image "Pasted image …" (lib/fileTypes.ts:70) | Same boxes as 6.9-15 lack it. | 2 | S |
| 6.9-17 | 6.9 File card | Collapsible type label above the card ("PDF ▾") | Done | MessageFiles.tsx:201-213 (button, `aria-expanded`, chevron flips; 12/16 muted, 2px gap, 44px target on phones); test MessageFiles.test.tsx:72 | | 2 | — |
| 6.9-18 | 6.9 File card | Card 380px wide | Done | MessageFiles.tsx:237 (`w-[380px] max-w-full`) | | 2 | — |
| 6.9-19 | 6.9 File card | `radius-lg`, 1px `line`, `surface` | Done | MessageFiles.tsx:237 | | 2 | — |
| 6.9-20 | 6.9 File card | 40px `surface-sunken` gray type icon | Done | MessageFiles.tsx:246 (`size-10 rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary`) | | 2 | — |
| 6.9-21 | 6.9 File card | Name in 14/600 | Done | MessageFiles.tsx:250 (`text-[14px]/[20px] font-semibold`, truncated) | | 2 | — |
| 6.9-22 | 6.9 File card | Sub-line "PDF · 2 pages · 184 KB" in `small` | Partial | MessageFiles.tsx:251; lib/fileTypes.ts:64-67 gives "PDF · 184 KB" in `sf-small` | No page count. Needs a `pages` field from the server (or a PDF read). | 2 | M |
| 6.9-23 | 6.9 File card | On hover the border becomes `line-strong` | Done | MessageFiles.tsx:237 (`hover:border-sf-line-strong`) | The image and video frames have no hover border (see 6.9-37). | 2 | — |
| 6.9-24 | 6.9 File card | Action pill on hover (top-right, raised surface, toolbar shadow, 28px buttons) | Done | MessageFiles.tsx:86-97 (`absolute end-2 top-2`, `gap-0.5 p-0.5 rounded-sf-md bg-sf-surface-raised shadow-sf-toolbar`); shown on hover, focus-within and while its menu is open; always on touch | | 2 | — |
| 6.9-25 | 6.9 File card | Pill: Download | Done | MessageFiles.tsx:98 | | 2 | — |
| 6.9-26 | 6.9 File card | Pill: Share | Different from spec (approved ruling: Share is for whoever uploaded the file or an Admin, after the security review) | MessageFiles.tsx:75,99; tasks/todo.md:748 | Spec shows Share for everyone. | 2 | — |
| 6.9-27 | 6.9 File card | Pill: Details opens the File details panel | Done | MessageFiles.tsx:100; ChannelPage.tsx:118 (`withInspector … kind: 'file'`) | | 2 | — |
| 6.9-28 | 6.9 File card | Pill: More | Done | MessageFiles.tsx:101-153 | | 2 | — |
| 6.9-29 | 6.9 File menu | Save for later | Not started (later phase) | not in MessageFiles.tsx:101-153; tasks/todo.md:752 "Waits" for Saved | | 3 | M |
| 6.9-30 | 6.9 File menu | Create task from file | Done | MessageFiles.tsx:119-123; test MessageFiles.test.tsx:95,176 | Only for a channel message in a project channel, not a reply (approved ruling, tasks/todo.md:748). | 2 | — |
| 6.9-31 | 6.9 File menu | Copy link to file | Done | MessageFiles.tsx:124-136 (permalink; "Link copied" note); test :46 | | 2 | — |
| 6.9-32 | 6.9 File menu | Separator, then Edit file details | Done | MessageFiles.tsx:137-144; window FileActions.tsx:78-133 (name, description) | | 2 | — |
| 6.9-33 | 6.9 File menu | Add to folder ▸ | Not started (later phase) | not in the menu; tasks/todo.md:752 "Waits" for the Files tab | | 3 | M |
| 6.9-34 | 6.9 File menu | Separator, then Delete file (`accent`, confirm; uploader or admin) | Done | MessageFiles.tsx:145-152 (`danger` item = `text-sf-accent`, components/sf/Menu.tsx:287); confirm FileActions.tsx:136-172; rights `file.manage` (:59) | | 2 | — |
| 6.9-35 | 6.9 File menu | OPEN: whether "Add to section" is needed besides folders | OPEN | spec §13 item 2 | | 2 | — |
| 6.9-36 | 6.9 Previews | Images inline, max 420px wide, `radius-lg` | Done | MessageFiles.tsx:217-225 (`<img>` `max-w-[min(420px,100%)]`, frame `rounded-sf-lg border`); opens the viewer on click | Plus an unrequested `max-h-80` cap and no `surface-sunken` backing (`.sf-image` has it). | 2 | — |
| 6.9-37 | 6.9 Previews | Image frame hugs the image (frame no wider than the image) | Different from spec | MessageFiles.tsx:219 wrapper `w-fit`; :220 frame is the `<button class="block overflow-hidden rounded-sf-lg border border-sf-line">`; :221 the 420px cap is on the `<img>` only (`max-h-80 max-w-[min(420px,100%)] object-contain`). No `max-w-[420px]` on the frame, unlike `.sf-image{max-width:420px}` | [app: confirmed. 1600×900 shows at 420×236 in a 571px frame; 2000×300 at 420×63 in a 1076px frame; screenshot 13] Likely yes, the frame can be wider than the image. A percentage max-width on the img doesn't count when the shrink-to-fit button and wrapper are sized, so for a natural width over 420px they size to the natural width (up to the row), while the img itself is clamped to 420px (or narrower by `max-h-80`, e.g. 320px for a square image). Result: an empty strip inside the border to the right of the image, and the action pill (`absolute end-2 top-2` on the same wrapper) sits at the frame's right edge, off the image. Fine only for images ≤420px wide and ≤320px tall, and on phones where the row is narrower than 420. No test covers it. Fix: `w-fit max-w-[420px]` on the frame, `block w-auto max-w-full` on the img, and drop or rework `max-h-80` (spec sets no height cap). | 2 | S |
| 6.9-38 | 6.9 Previews | Video inline, max 420px wide, `radius-lg` | Partial | MessageFiles.tsx:226-234 (`<video controls>` `max-w-[min(420px,100%)] rounded-sf-lg border`; only for types the browser can play, :189) | [app check] Same wrapper issue as 6.9-37: the `w-fit` wrapper (:228) can be wider than the 420px video, so the pill floats beside the video. | 2 | S |
| 6.9-39 | 6.9 Previews | PDF preview | Done | MessageFiles.tsx:238-252 opens components/ui/FileViewer.tsx:127-151 (`%PDF-` check, blob iframe); full-screen viewer, not inline | | 2 | — |
| 6.9-40 | 6.9 Previews | Code with highlighting | Not started (later phase) | components/ui/FileViewer.tsx:185-221 shows `.txt` as a plain `<pre>` and `.csv` as a table; no highlighter | §12 lists "previews" in Phase 2, but the approved slice 6 plan defers highlighting to Phase 3 with Text snippet (tasks/todo.md:752; contract line 372). No code file types are accepted anyway (lib/fileTypes.ts:4-9). | 2 (plan: 3) | M |
| 6.9-41 | 6.9 Previews | Office files through a converted preview | Done | MessageFiles.tsx:195-199 (uses `attachment.previewUrl`; Download keeps the original); test MessageFiles.test.tsx:130 | The mock never makes a `previewUrl` (mocks/files.ts:45), so office files only download in the prototype. | 2 | — |
| 6.9-42 | 6.9 Previews | RTF through a converted preview | Missing | `.rtf` isn't an accepted type (lib/fileTypes.ts:4-9) | RTF can't be uploaded at all. Adding it is a security call per the slice 6 ruling (tasks/todo.md:737). | 2 | S |
| 6.9-43 | 6.9 Previews | Anything else downloads | Done | components/ui/FileViewer.tsx:225-245 (`NoPreview` with Download) | | 2 | — |
| 6.9-44 | 6.9 Details panel | Preview | Partial | files/FileInspector.tsx:67-73 (160px box: the image for pictures, otherwise a small file icon) | No rendered preview for PDF, video or office files; `thumbUrl` unused. | 2 | S |
| 6.9-45 | 6.9 Details panel | Name | Done | files/FileInspector.tsx:171 (title in the panel header), :75 (original name when renamed) | | 2 | — |
| 6.9-46 | 6.9 Details panel | Type and size | Done | files/FileInspector.tsx:76 (`PDF · 184 KB`) | | 2 | — |
| 6.9-47 | 6.9 Details panel | Download button | Done | files/FileInspector.tsx:79-81 | | 2 | — |
| 6.9-48 | 6.9 Details panel | Share button | Done | files/FileInspector.tsx:82-86 | Only for whoever uploaded it or an Admin (ruling, see 6.9-26). | 2 | — |
| 6.9-49 | 6.9 Details panel | Open button | Done | files/FileInspector.tsx:87-89 | The panel's Open ignores the office preview (parked, tasks/todo.md:790). | 2 | — |
| 6.9-50 | 6.9 Details panel | Uploaded by | Done | files/FileInspector.tsx:92 | | 2 | — |
| 6.9-51 | 6.9 Details panel | Uploaded (date) | Done | files/FileInspector.tsx:93 (`formatDate`) | | 2 | — |
| 6.9-52 | 6.9 Details panel | Shared in (channels and tasks) | Done | files/FileInspector.tsx:94-125 (channels and threads with links, task keys, projects) | | 2 | — |
| 6.9-53 | 6.9 Details panel | Folder | Not started (later phase) | no Folder row in files/FileInspector.tsx:91-136; folders come with the Files tab | | 3 | M |
| 6.9-54 | 6.9 Details panel | Access | Done | files/FileInspector.tsx:30-43,126-132 | | 2 | — |
| 6.9-55 | 6.9 Details panel | Description, with Edit file details | Done | files/FileInspector.tsx:133-143 (button below the list, for whoever may) | | 2 | — |
| 6.9-56 | 6.9 Text snippet | Modal 720px wide, `radius-lg` (§6.10 common rules) | Not started (later phase) | no snippet modal in src | | 3 | M |
| 6.9-57 | 6.9 Text snippet | Title field | Not started (later phase) | none | | 3 | S |
| 6.9-58 | 6.9 Text snippet | Type (language select) | Not started (later phase) | none | | 3 | S |
| 6.9-59 | 6.9 Text snippet | Content editor with line numbers (mono, `surface-sunken`) | Not started (later phase) | none | | 3 | M |
| 6.9-60 | 6.9 Text snippet | Optional message field | Not started (later phase) | none | | 3 | S |
| 6.9-61 | 6.9 Text snippet | Footer note "Shares to #channel" | Not started (later phase) | none | | 3 | S |
| 6.9-62 | 6.9 Text snippet | Cancel | Not started (later phase) | none | | 3 | S |
| 6.9-63 | 6.9 Text snippet | Create snippet | Not started (later phase) | none | | 3 | S |
| 6.9-64 | 6.9 Text snippet | Renders in the message as a collapsible code card with copy and download | Not started (later phase) | none | | 3 | M |
| 6.9-65 | 6.9 Voice and video | Record in the browser after permission prompts | Not started (later phase) | no `getUserMedia` / MediaRecorder use in src | | 4 | L |
| 6.9-66 | 6.9 Voice and video | Preview the recording | Not started (later phase) | none | | 4 | M |
| 6.9-67 | 6.9 Voice and video | Re-record | Not started (later phase) | none | | 4 | S |
| 6.9-68 | 6.9 Voice and video | Attach the recording to the message | Not started (later phase) | none | | 4 | M |
| 6.9-69 | 6.9 Voice and video | Player: 32px `accent-fill` play button | Not started (later phase) | no `sf-clip` equivalent | | 4 | M |
| 6.9-70 | 6.9 Voice and video | Waveform in `line-strong`, turning `accent` as it plays | Not started (later phase) | none | | 4 | M |
| 6.9-71 | 6.9 Voice and video | Duration | Not started (later phase) | none | | 4 | S |
| 6.9-72 | 6.9 Voice and video | "Show transcript" when a transcript exists | OPEN | spec §13 item 5 (transcription provider) | | 4 | M |

#### Notes

- Everything Phase 0-2 in these sections is built except: `@` groups, the invite-on-send prompt, `@here` / `@channel` and its 25-member confirm, the `:` emoji autocomplete, the focus colour of the formatting icons, and RTF previews. The action row, Send size, Send colours and tray, file card and details panel otherwise follow the reference CSS value for value.
- The image frame question (6.9-37): the frame is the `<button>` with the border; only the `<img>` carries the 420px cap. The same wrapper positions the action pill, so on desktop widths a large image gets a frame wider than the picture and the pill off to the side. Please confirm in the app with a wide screenshot (e.g. 1600×900) in a ~700px message column.
- Phase 3 and 4 controls (video, voice, /, split Send, Schedule, Text snippet, GIFs, Task list, Page, Run an automation) have no code at all: no placeholders, no hidden menu items. When they land, the action row needs the `sf-cbar-sep` separators and the 560px collapse into "…".
- `@all` is the everyone mention (docs: CLAUDE.md "Mentions & comments"), while the spec has `@here` and `@channel`. Changing it touches `lib/mentions.ts`, `lib/messageBody.ts`, the mock's notifications and `api-contract.md`, not only the composer.
- Enter on touch screens makes a new line (composer/KeysPlugin.tsx:60). It's sensible but isn't in the spec and has no recorded ruling.
- Two composers exist. The project Chat tab and task comments still use the old textarea `Composer` (pages/chat/Composer.tsx), with no formatting row, no `#` autocomplete, no tray or drop. That is outside §6.8 as written (it is "the composer" of the channel and thread), but "drag-and-drop and paste work everywhere" (6.9) is not true there.
- The file viewer (components/ui/FileViewer.tsx) is the CRM's: lucide icons, `bg-black/85`, `brand-500` button, no `sf` tokens. The chat spec doesn't describe the viewer, but CLAUDE.md says chat uses `sf` primitives.
- `thumbUrl` is in the contract and the record but unused by the UI (tray, inline images, details panel).
- Test gaps: no test for the image frame width, for ⌘B / ⌘I / ⌘⇧X keys, or for typing `1. ` or a ``` fence. The typing-line colour and the formatting-icon focus colour are untested (both would need a computed-style check in the browser project).
- Recorded rulings that apply here (tasks/todo.md, slice 6): ⌘U uploads in channel and thread boxes (line 737); same file types as the rest of the app, 25 MB default size (line 737); Share limited to uploader or Admin, Create task from file only on channel messages, pill and More always shown on touch (line 748); Save for later, Add to folder, Add from Flow files, Text snippet, code highlighting wait for Phase 3 and voice / video for Phase 4 (line 752).

### Audit E — FLOW_CHAT_REDESIGN.md §6.10 Modals, §6.11 Notifications popover, §6.12 Full views, §6.13 Calls, §6.14 Channel page and new channels, §6.15 Toasts and tooltips, §6.16 Mobile

Repo: `/Users/ezzelden/Work/ezz/WORK/Spark/DEV/Spark_Flow/spark-flow-web`. Read-only audit. Compared against `docs/flow-chat/design/spark-flow-components.reference.css` (`sf-modal`, `sf-admin`, `sf-toast`, `sf-tooltip`, `sf-view`, `sf-feed-item`, `sf-chip`, `sf-tabs`) and `tasks/todo.md` rulings (slice 3 Activity and notifications, slice 4 Channel details, slice 5 Add people, plus the "Toast is only for Undo" rule in CLAUDE.md).

| ID | Section | Requirement | Status | Evidence | Gap | Phase | Effort |
|---|---|---|---|---|---|---|---|
| 6.10-01 | 6.10 Common | Modal 540px wide (phone: 100% less 32px) | Done | `src/components/sf/Modal.tsx:68` `w-[min(540px,calc(100vw-32px))]`; matches `.sf-modal` width and the phone rule at reference CSS line 355 | | 0 | — |
| 6.10-02 | 6.10 Common | 720px wide variant for the text snippet | Not started (later phase) | `Modal.tsx` has no width prop; no snippet modal in `src/pages/chat` | Needs a `wide` prop (720px) when the snippet is built | 3 | S |
| 6.10-03 | 6.10 Common | `radius-lg` | Done | `Modal.tsx:68` `rounded-sf-lg` | | 0 | — |
| 6.10-04 | 6.10 Common | 24px padding | Done | `Modal.tsx:68` `p-6` | | 0 | — |
| 6.10-05 | 6.10 Common | `title` heading (20/28, 600) | Done | `Modal.tsx:72` `h2.sf-title` (`src/index.css:317` = 600 20px/28px) | | 0 | — |
| 6.10-06 | 6.10 Common | Optional `small` subtitle | Done | `Modal.tsx:75-79` `description` as `sf-small` in `text-sf-text-secondary`, `mt-1` | | 0 | — |
| 6.10-07 | 6.10 Common | × at the end of the header | Done | `Modal.tsx:83-90` Close `IconButton`, `ms-auto` (after actions); 44px touch area on phones | | 0 | — |
| 6.10-08 | 6.10 Common | Actions at the end of the footer, primary last | Done | `Modal.tsx:93` `justify-end gap-2`; callers put Cancel first, primary last: `ChannelMembers.tsx:411-416`, `ChannelActions.tsx:59-62`, `MessageActions.tsx:155-157` | | 0 | — |
| 6.10-09 | 6.10 Common | Focus is trapped while open | Partial | `Modal.tsx:67` `onKeyDown={trapTab}` on the panel; `layers.tsx:61-77`; first focus `Modal.tsx:40-53`; `layers.test.tsx:174` | [app: checked. After a scrim click focus sits on body, but the next Tab goes back into the dialog (Close); the page behind is not reached] The trap listens on the panel only. A click on the scrim (or any non-focusable part outside the panel) puts focus on `body`; the next Tab then goes to the page behind the dialog. No `inert` on the page and no focus guard | 0 | S |
| 6.10-10 | 6.10 Common | Esc closes | Done | `Modal.tsx:37` `useEscapeLayer(open, onClose)`; top-most layer only (`layers.tsx:13-34`); `layers.test.tsx:186` | | 0 | — |
| 6.10-11 | 6.10 Common | Focus returns to the trigger | Done | `Modal.tsx:38` `useRestoreFocus` with `fallbackFocus` when the trigger is gone (`layers.tsx:37-50`); `layers.test.tsx:186, 377` | | 0 | — |
| 6.10-12 | 6.10 Common | Clicking the scrim does not close a modal with unsaved input | Done | `Modal.tsx:58` the scrim has no click handler, so it never closes on a scrim click (stricter than the spec, which only protects unsaved input); `layers.test.tsx:186` | | 0 | — |
| 6.10-13 | 6.10 Add people | Modal "Add people to #channel" | Done | `ChannelMembers.tsx:405-408` | | 2 | — |
| 6.10-14 | 6.10 Add people | Token input labelled "Names or emails" | Done | `ChannelMembers.tsx:421`; `TokenInput.tsx:93-95` label bound to the combobox | | 2 | — |
| 6.10-15 | 6.10 Add people | Autocomplete: members | Done | `ChannelMembers.tsx:288-293` people not in the channel, by name or email start, never me; `ChannelDetails.test.tsx:433` | | 2 | — |
| 6.10-16 | 6.10 Add people | Autocomplete: user groups | Done | `ChannelMembers.tsx:294-296` teams as `kind: 'group'` ("Backend · 4 people"); a team adds a chip for each of its people not in yet (`:303-307`) | | 2 | — |
| 6.10-17 | 6.10 Add people | Autocomplete: raw emails | Done | `ChannelMembers.tsx:287, 297` typed email offered as "Invite as a guest" for Admins; others get "Only admins can invite people by email." (`:326`) | | 2 | — |
| 6.10-18 | 6.10 Add people | Chip shows avatar and name | Done | `TokenInput.tsx:11-16, 115-118` person kind draws `Avatar` size sm; chip 28px, `surface-hover`, `line` border as `.sf-chip` | | 2 | — |
| 6.10-19 | 6.10 Add people | Chip for an email: mail icon, email, "Guest" tag | Done | `TokenInput.tsx:13, 118` `IconMail` + `Tag` "Guest"; `layers.test.tsx:428-439` | | 2 | — |
| 6.10-20 | 6.10 Add people | Chip has × | Done | `TokenInput.tsx:119-133` "Remove <label>", 24px, 44px touch on phones | | 2 | — |
| 6.10-21 | 6.10 Add people | Helper text for an email recipient (copy) | Done | `src/lib/invites.ts:27-30` exact copy "x isn't in Spark Systems yet. They'll get an email invite as a guest who can see #channel only."; wired `ChannelMembers.tsx:434` | | 2 | — |
| 6.10-22 | 6.10 Add people | Admin-only block on `surface-sunken` | Done | `ChannelMembers.tsx:464` border `line`, `rounded-sf-md`, `px-4 py-3`, `mt-4`, `gap-2` = `.sf-admin`; shown only when `rights.setDefault` (Admins, public channel) `:437` | | 2 | — |
| 6.10-23 | 6.10 Add people | Eye icon and "Only admins can see this setting" | Done | `ChannelMembers.tsx:465-468` `IconEye` 16 + `sf-meta` text | | 2 | — |
| 6.10-24 | 6.10 Add people | Switch "When new people join Spark Systems, add them to #channel" (default channel) | Done | `ChannelMembers.tsx:469-472`; `Toggle`; saves `isDefault` at once (`:455`); `ChannelDetails.test.tsx:463` | | 2 | — |
| 6.10-25 | 6.10 Add people | Footer: Cancel | Done | `ChannelMembers.tsx:411-413` | | 2 | — |
| 6.10-26 | 6.10 Add people | Footer: primary "Add N people" | Done | `ChannelMembers.tsx:414-416` "Add N people" (counts chips plus typed text; singular reads "Add 1 person", "Adding…" while pending) | | 2 | — |
| 6.10-27 | 6.10 Add people | Add is disabled when N is 0 | Done | `ChannelMembers.tsx:414` `disabled={(count === 0 && !query.trim()) \|\| pending}` (stays enabled while text is typed so Add can say why it can't be added) | | 2 | — |
| 6.10-28 | 6.10 Add people | On success, show a toast | Different from spec (approved ruling: no toasts except Undo, CLAUDE.md "Toast is only for Undo after a delete") | `ChannelMembers.tsx:395-396` `await onAdd(...)` then `onClose()`; no `useToast`; the result shows in the Members list, Invited · N and the channel's "added …" system message (`tasks/todo.md` slice 5 "Verified") | No success toast; the window closes and the lists update | 2 | — |
| 6.10-29 | 6.10 Add people | Email recipients create pending invitations | Done | `src/api/types.ts:151-162` `Invitation` (status pending); `ChannelMembers.tsx:395` sends `emails`; "Invited · N" with Revoke `:124-208`; `ChannelDetails.test.tsx:482-520` | | 2 | — |
| 6.10-30 | 6.10 Add people | Invitation is guest or member, by workspace policy | Partial | `types.ts:152-159` `role: 'guest'` only, comment "waits for a policy" | Every email invite is a guest; no workspace policy, no member invites; accepting the invite is not built (own slice) | 2 | M |
| 6.10-31 | 6.10 Channel details | Header: `# name` | Done | `ChannelDetails.tsx:125-130` hash icon (lock when private) + name | | 2 | — |
| 6.10-32 | 6.10 Channel details | Header: Star | Done | `ChannelDetails.tsx:133-140` `IconButton` "Star channel", pressed state, filled star | | 2 | — |
| 6.10-33 | 6.10 Channel details | Header: notification level button ("All new messages ▾") | Done | `ChannelDetails.tsx:141-152` `NotifyLevelMenu` trigger shows the level label (or "Muted") plus `IconChevronDown`; `ChannelDetails.test.tsx:58, 69` | | 2 | — |
| 6.10-34 | 6.10 Channel details | Header: Start a call | Not started (later phase) | Nothing in `ChannelDetails.tsx`; excluded by the slice 4 ruling ("no Start a call") | Add when Calls (6.13) are built | 4 | S |
| 6.10-35 | 6.10 Channel details | Tab About | Done | `ChannelDetails.tsx:111, 166-168` | | 2 | — |
| 6.10-36 | 6.10 Channel details | Tab Members (count) | Done | `ChannelDetails.tsx:112` `count: channel.memberIds.length`; `Tabs.tsx:50-54`; `ChannelDetails.test.tsx:58` | | 2 | — |
| 6.10-37 | 6.10 Channel details | Tab Tabs | Not started (later phase) | Not in `tabs` (`ChannelDetails.tsx:110-114`); slice 4 ruling "no Tabs or Integrations tabs" | Depends on Pins, Files tabs and bookmarks (Phase 3) | 3 | M |
| 6.10-38 | 6.10 Channel details | Tab Integrations | Not started (later phase) | Not in `tabs`; same ruling | Depends on Apps (webhooks, interactive messages), Phase 4 | 4 | M |
| 6.10-39 | 6.10 Channel details | Tab Settings | Done | `ChannelDetails.tsx:113, 185` shown when `rights.manage` (channel members, or workspace Admins on public channels, not only admins; see Notes) | | 2 | — |
| 6.10-40 | 6.10 Channel details | Settings: rename | Different from spec | Rename is the Channel name card's Edit on About (`ChannelDetails.tsx:365-375`); `Settings` (`:434-488`) has no rename | Spec lists rename under Settings; here it lives on About | 2 | S |
| 6.10-41 | 6.10 Channel details | Settings: posting permissions | Done | `ChannelDetails.tsx:456-479` "Who can post" radios (Everyone in the channel / Only admins), admin-only to change; `ChannelDetails.test.tsx:217-230` | | 2 | — |
| 6.10-42 | 6.10 Channel details | Settings: archive | Done | `ChannelDetails.tsx:481-485` "Archive channel" opens `ArchiveChannelModal` (`ChannelActions.tsx:45-69`); `ChannelDetails.test.tsx:231` | | 2 | — |
| 6.10-43 | 6.10 Channel details | About card: Channel name, with Edit | Done | `ChannelDetails.tsx:365-375` `EditableCard`, Edit button `:298-304`, edit in place with Save and Cancel | | 2 | — |
| 6.10-44 | 6.10 Channel details | About card: Topic, with Edit | Done | `ChannelDetails.tsx:376-384` | | 2 | — |
| 6.10-45 | 6.10 Channel details | About card: Description, with Edit | Done | `ChannelDetails.tsx:385-394` multiline, keeps line breaks (`:324`) | | 2 | — |
| 6.10-46 | 6.10 Channel details | Linked project card | Different from spec (approved ruling: slice 4, linked project read-only, no linking for other channels yet) | `ChannelDetails.tsx:395-401` card titled "Project", shown only on a project's channel | Title is "Project", not "Linked project"; no card on other channels, so nothing to link | 2 | M |
| 6.10-47 | 6.10 Channel details | Linked project text "Nexus Core · task keys NEX-* open as cards here" | Done | `ChannelDetails.tsx:398` `${project.name} · task keys ${project.key}-* open as cards here` | | 2 | — |
| 6.10-48 | 6.10 Channel details | Linked project "Change" action | Different from spec (approved ruling: slice 4, read-only) | `ChannelDetails.tsx:396` "Open project" link in place of Change | No Change, no way to link or relink a project (needs a link route) | 2 | M |
| 6.10-49 | 6.10 Channel details | Copy channel link | Done | `ChannelDetails.tsx:403-418` button with link icon; "Link copied" shown inline (`:416-418`), no toast (ruling); `ChannelDetails.test.tsx:144` | | 2 | — |
| 6.10-50 | 6.10 Channel details | "Leave channel" text button in `accent` | Done | `ChannelDetails.tsx:419-423` `text-sf-accent`, end-aligned, for members who may leave | | 2 | — |
| 6.10-51 | 6.10 Confirmations | Title states the action | Done | "Archive #x?" `ChannelActions.tsx:55`; "Remove X from #y?" `ChannelMembers.tsx:230`; "Delete message?" `MessageActions.tsx:151`; "Delete <file>?" `FileActions.tsx:152`; "Mark everything read?" `ChannelShortcuts.tsx:51` | | 2 | — |
| 6.10-52 | 6.10 Confirmations | Body states the consequence | Done | `ChannelActions.tsx:56`, `ChannelMembers.tsx:231`, `MessageActions.tsx:152`, `FileActions.tsx:153`, `ChannelShortcuts.tsx:52` | | 2 | — |
| 6.10-53 | 6.10 Confirmations | Confirm button repeats the verb | Done | "Archive channel", "Remove", "Delete message", "Delete", "Mark all read" (`ChannelActions.tsx:61`, `ChannelMembers.tsx:238`, `MessageActions.tsx:157`, `FileActions.tsx:160`, `ChannelShortcuts.tsx:71`) | | 2 | — |
| 6.11-01 | 6.11 Notifications | Heading "Notify me about" | Done | `NotifyLevelMenu.tsx:36` | | 2 | — |
| 6.11-02 | 6.11 Notifications | Radio item: All new messages | Done | `NotifyLevelMenu.tsx:8, 37-41` | | 2 | — |
| 6.11-03 | 6.11 Notifications | Radio item: Mentions and keywords | Partial | `NotifyLevelMenu.tsx:9` label matches the spec | Level works for mentions only; there are no keywords to match (waits for Preferences, slice 3 ruling) | 2 | M |
| 6.11-04 | 6.11 Notifications | Radio item: Nothing | Done | `NotifyLevelMenu.tsx:10`; a channel at Nothing is left out of Activity and the bell (`tasks/todo.md` slice 3) | | 2 | — |
| 6.11-05 | 6.11 Notifications | Items are radios with a check | Done | `Menu.tsx:248-294` `checked` gives `role="menuitemradio"`, `aria-checked` and an `IconCheck` at the end; picking the set level sends nothing (`NotifyLevelMenu.tsx:38`) | | 2 | — |
| 6.11-06 | 6.11 Notifications | Mute channel | Done | `NotifyLevelMenu.tsx:42-45` separator, then "Mute channel" / "Unmute channel" (conversation in a DM) | | 2 | — |
| 6.11-07 | 6.11 Notifications | Mute moves the channel to the bottom | Done | `src/lib/channels.ts:25-35` `mutedLast`; also in Starred (`useSidebarGroups.ts:42`); `channels.test.ts:53, 67` | | 2 | — |
| 6.11-08 | 6.11 Notifications | Mute: no badges | Done | `Sidebar.tsx:91-93` count 0 and not bold when muted; `:131-137` no unread marker; `:147-148` bell-off icon | | 2 | — |
| 6.11-09 | 6.11 Notifications | Item "Desktop, mobile and email…" | Missing | Not in `NotifyLevelMenu.tsx`; deferred to Preferences by the slice 3 ruling | No item and no Preferences page to open | 2 | M |
| 6.11-10 | 6.11 Notifications | Note on Do Not Disturb with a link to Preferences | Missing | Not in `NotifyLevelMenu.tsx`; `UserMenu.tsx:100` "Preferences" holds Theme only | No note, no link, no Preferences page | 2 | S |
| 6.11-11 | 6.11 Notifications | Per-channel levels override the global default | Partial | Per-channel level stored and sent (`PATCH …/me { notifyLevel }`); kind defaults exist (channel mentions, DM all) per `tasks/todo.md` slice 3 | No global default setting; `NotificationPref` entity (spec §7) absent | 2 | M |
| 6.11-12 | 6.11 Notifications | Do Not Disturb has a schedule | Missing | Nothing in `src/` (`grep -i "do not disturb"` finds no UI); deferred to Preferences | No DND setting or schedule | 2 | M |
| 6.11-13 | 6.11 Notifications | Delivery: in-app badges | Done | Sidebar bold and counts (`Sidebar.tsx:91-137`), Activity count (`useSidebarGroups.ts:49`), the top-bar bell | | 2 | — |
| 6.11-14 | 6.11 Notifications | Delivery: desktop notifications | Missing | No `Notification` API use in `src/`; deferred with Preferences | No permission prompt, no desktop notification | 2 | M |
| 6.11-15 | 6.11 Notifications | Delivery: mobile push | Missing | No service worker or push code in `src/` | Needs push registration and a backend sender | 2 | L |
| 6.11-16 | 6.11 Notifications | Delivery: email digest of missed mentions | Missing | Nothing in `src/` or `api-contract.md` | Backend job and a setting; no client work yet | 2 | L |
| 6.12-01 | 6.12 Common | Each view has a 52px header with a `title` | Different from spec | `ActivityView.tsx:92-95` `h-sf-header` (52px), `sf-title` h1; reference `.sf-view-head` (CSS line 363) pads `0 16px 0 24px` | [app check] End padding is `pe-3` (12px), reference is 16px; the other views are not built | 2 | S |
| 6.12-02 | 6.12 Common | Optional tabs row | Done | `ActivityView.tsx:110` `Tabs` (40px, `Tabs.tsx:27`) | | 2 | — |
| 6.12-03 | 6.12 Common | Scrolling body | Done | `ActivityView.tsx:111` `min-h-0 flex-1 overflow-y-auto pb-6` (reference `.sf-view-body` also has 8px top padding, not applied) | | 2 | — |
| 6.12-04 | 6.12 Search | Search opened with ⌘K | Partial | `GlobalSearch.tsx:215` ⌘/Ctrl+K opens a palette of pages, people, tasks and channels (`:41-56`) | No Search view in the main pane; messages and files are not searched ("TODO(api)" at `:15`) | 3 | L |
| 6.12-05 | 6.12 Search | Search from a channel (channel search) | Not started (later phase) | No search control in `ChannelHeader.tsx` ("Call and channel search come in later phases", `:51`) | | 3 | M |
| 6.12-06 | 6.12 Search | Header "Results for “query”" | Not started (later phase) | No search route in `src/router.tsx:72-83` | | 3 | S |
| 6.12-07 | 6.12 Search | Sort control (Most relevant / Newest) | Not started (later phase) | none | | 3 | S |
| 6.12-08 | 6.12 Search | Tab Messages, with a count | Not started (later phase) | none; no search API in `src/api/types.ts` | | 3 | M |
| 6.12-09 | 6.12 Search | Tab Files, with a count | Not started (later phase) | none | | 3 | M |
| 6.12-10 | 6.12 Search | Tab Tasks, with a count | Not started (later phase) | none | | 3 | M |
| 6.12-11 | 6.12 Search | Tab Channels, with a count | Not started (later phase) | none | | 3 | M |
| 6.12-12 | 6.12 Search | Tab People, with a count | Not started (later phase) | none | | 3 | M |
| 6.12-13 | 6.12 Search | Filter chip From | Not started (later phase) | none (reference `.sf-filter` CSS only) | | 3 | M |
| 6.12-14 | 6.12 Search | Filter chip In | Not started (later phase) | none | | 3 | M |
| 6.12-15 | 6.12 Search | Filter chip Date | Not started (later phase) | none | | 3 | M |
| 6.12-16 | 6.12 Search | Filter chip Has | Not started (later phase) | none | | 3 | M |
| 6.12-17 | 6.12 Search | Filter chip Only threads | Not started (later phase) | none | | 3 | S |
| 6.12-18 | 6.12 Search | Selected chips inverted, with × | Not started (later phase) | none (reference `.sf-filter--on`) | | 3 | S |
| 6.12-19 | 6.12 Search | Operator hint (`from:@nour`, `has:file`) | Not started (later phase) | none | | 3 | S |
| 6.12-20 | 6.12 Search | Quoted phrases supported | Not started (later phase) | none | | 3 | M |
| 6.12-21 | 6.12 Search | Result card: channel and date | Not started (later phase) | none (reference `.sf-result`, `.sf-result-ctx`) | | 3 | S |
| 6.12-22 | 6.12 Search | Message with matches highlighted (`surface-selected`, weight 600) | Not started (later phase) | none (reference `.sf-hl`) | | 3 | S |
| 6.12-23 | 6.12 Search | Hover shows "View in channel" | Not started (later phase) | none | | 3 | S |
| 6.12-24 | 6.12 Search | "View in channel" jumps to the message and selects it | Not started (later phase) | The jump exists for permalinks and Activity (`paths.message`, `useJumpTarget` in `ChannelPage.tsx`) but no result links to it | Reuse the permalink jump | 3 | S |
| 6.12-25 | 6.12 Search | Backend full-text index that respects channel permissions | Not started (later phase) | No search route in `src/api/types.ts` or `docs/flow-chat/api-contract.md` | | 3 | L |
| 6.12-26 | 6.12 Activity | Tab All | Done | `activityRows.ts:8`; `ActivityView.test.tsx:39` | | 2 | — |
| 6.12-27 | 6.12 Activity | Tab Mentions | Done | `activityRows.ts:9` | | 2 | — |
| 6.12-28 | 6.12 Activity | Tab Reactions | Done | `activityRows.ts:10` | | 2 | — |
| 6.12-29 | 6.12 Activity | Tab Threads | Done | `activityRows.ts:11` | | 2 | — |
| 6.12-30 | 6.12 Activity | Tab Reminders | Not started (later phase) | `activityRows.ts:6` "Reminders comes with reminders (Phase 3)"; hidden by the slice 3 ruling | Needs Remind me and Flowbot DMs | 3 | M |
| 6.12-31 | 6.12 Activity | "Unread only" switch | Done | `ActivityView.tsx:97-100` `Toggle` inside a 44px label on phones; `ActivityView.test.tsx:78` | | 2 | — |
| 6.12-32 | 6.12 Activity | "Mark all read" | Done | `ActivityView.tsx:101-103` (on All marks everything, on other tabs that tab's unread rows); `ActivityView.test.tsx:92` | | 2 | — |
| 6.12-33 | 6.12 Activity | Row: red unread dot | Done | `ActivityView.tsx:62-68` 8px `bg-sf-accent-fill` dot with sr-only "Unread, " | | 2 | — |
| 6.12-34 | 6.12 Activity | Row: avatar | Done | `ActivityView.tsx:69` | | 2 | — |
| 6.12-35 | 6.12 Activity | Row: kind line icon | Done | `ActivityView.tsx:14, 72` `IconAt` / `IconMoodSmile` / `IconMessages` at 16px | | 2 | — |
| 6.12-36 | 6.12 Activity | Row: kind line text ("Mentioned you in #frontend-dev") | Done | `activityRows.ts:24-29` "Mentioned you in #x", "<name> reacted 👍 to your message in #x", "Replied in a thread you follow in #x"; `ActivityView.test.tsx:48` | | 2 | — |
| 6.12-37 | 6.12 Activity | Row: the text | Done | `ActivityView.tsx:75-82` excerpt, two lines clamped | | 2 | — |
| 6.12-38 | 6.12 Activity | Row: the time | Done | `ActivityView.tsx:84` `timeAgo`, ticks every minute (`useNow(60_000)`) | | 2 | — |
| 6.12-39 | 6.12 Activity | "Earlier" group follows the unread rows | Done | `ActivityView.tsx:131-139`; `ActivityView.test.tsx:48` | | 2 | — |
| 6.12-40 | 6.12 Threads | Cards per followed thread, unread replies first | Not started (later phase) | No `/threads` route (`src/router.tsx:72-83`); the sidebar link is behind `chatRedesign` (`Sidebar.tsx:306-308`) and goes nowhere. Follow state exists (slice 2) | | 3 | L |
| 6.12-41 | 6.12 Threads | Card header: channel | Not started (later phase) | none | | 3 | S |
| 6.12-42 | 6.12 Threads | Card header: participants | Not started (later phase) | none | | 3 | S |
| 6.12-43 | 6.12 Threads | Card header: Unfollow | Not started (later phase) | Following is toggled from a message's ⋯ menu (`MessageActions.tsx:18` "Turn off notifications for replies"), not on a card | | 3 | S |
| 6.12-44 | 6.12 Threads | Card header: ⋮ menu | Not started (later phase) | none | | 3 | S |
| 6.12-45 | 6.12 Threads | The parent message | Not started (later phase) | none | | 3 | S |
| 6.12-46 | 6.12 Threads | "Show N more replies" | Not started (later phase) | none | | 3 | S |
| 6.12-47 | 6.12 Threads | Latest replies | Not started (later phase) | none | | 3 | S |
| 6.12-48 | 6.12 Threads | Inline reply composer | Not started (later phase) | `ThreadComposer.tsx` exists for the panel; not used on a card | | 3 | M |
| 6.12-49 | 6.12 Threads | "You're caught up." | Not started (later phase) | none | | 3 | S |
| 6.12-50 | 6.12 Saved | Tab In progress (count) | Not started (later phase) | No saved items in `src/api/types.ts`; no route; link behind `chatRedesign` (`Sidebar.tsx:318-320`) | | 3 | L |
| 6.12-51 | 6.12 Saved | Tab Archived | Not started (later phase) | none | | 3 | S |
| 6.12-52 | 6.12 Saved | Tab Completed | Not started (later phase) | none | | 3 | S |
| 6.12-53 | 6.12 Saved | Row: complete checkbox | Not started (later phase) | none | | 3 | S |
| 6.12-54 | 6.12 Saved | Row: avatar or file icon | Not started (later phase) | none | | 3 | S |
| 6.12-55 | 6.12 Saved | Row: source line | Not started (later phase) | none | | 3 | S |
| 6.12-56 | 6.12 Saved | Row: text | Not started (later phase) | none | | 3 | S |
| 6.12-57 | 6.12 Saved | Row: reminder time (`accent` when due within 24h) | Not started (later phase) | none (reference `.sf-due--soon`) | | 3 | S |
| 6.12-58 | 6.12 Saved | Hover action: complete | Not started (later phase) | none | | 3 | S |
| 6.12-59 | 6.12 Saved | Hover action: change reminder | Not started (later phase) | none | | 3 | M |
| 6.12-60 | 6.12 Saved | Hover action: archive | Not started (later phase) | none | | 3 | S |
| 6.12-61 | 6.12 Saved | Hover action: more | Not started (later phase) | none | | 3 | S |
| 6.12-62 | 6.12 Drafts & sent | Tab Drafts | Not started (later phase) | Drafts are saved per channel and thread (`useDrafts`, `api.chat.saveDraft`, `types.ts:395`) but there is no view; link behind `chatRedesign` (`Sidebar.tsx:315-317`) | | 3 | M |
| 6.12-63 | 6.12 Drafts & sent | Tab Scheduled | Not started (later phase) | No scheduled send in `src/api/types.ts` | | 3 | L |
| 6.12-64 | 6.12 Drafts & sent | Tab Sent | Not started (later phase) | none | | 3 | M |
| 6.12-65 | 6.12 Drafts & sent | Scheduled row: destination | Not started (later phase) | none | | 3 | S |
| 6.12-66 | 6.12 Drafts & sent | Scheduled row: "Sends tomorrow at 9:00 AM" | Not started (later phase) | none | | 3 | S |
| 6.12-67 | 6.12 Drafts & sent | Scheduled row: the text | Not started (later phase) | none | | 3 | S |
| 6.12-68 | 6.12 Drafts & sent | Scheduled row action: Send now | Not started (later phase) | none | | 3 | S |
| 6.12-69 | 6.12 Drafts & sent | Scheduled row action: Reschedule | Not started (later phase) | none | | 3 | S |
| 6.12-70 | 6.12 Drafts & sent | Scheduled row action: Edit | Not started (later phase) | none | | 3 | S |
| 6.12-71 | 6.12 Drafts & sent | Scheduled row action: Delete | Not started (later phase) | none | | 3 | S |
| 6.12-72 | 6.12 Drafts & sent | Note states the viewer's time zone | Not started (later phase) | none | | 3 | S |
| 6.13-01 | 6.13 Calls | Entry: Call split button in the header | Not started (later phase) | `SplitButton` primitive exists (`src/components/sf/SplitButton.tsx`, shown in `UiGallery.tsx:148`) but is not in `ChannelHeader.tsx` | | 4 | M |
| 6.13-02 | 6.13 Calls | ▾ menu: start with video | Not started (later phase) | Gallery sample only (`UiGallery.tsx:149`) | | 4 | S |
| 6.13-03 | 6.13 Calls | ▾ menu: share screen | Not started (later phase) | none | | 4 | S |
| 6.13-04 | 6.13 Calls | ▾ menu: copy call link | Not started (later phase) | none | | 4 | S |
| 6.13-05 | 6.13 Calls | Entry: `/call` command | Not started (later phase) | No slash commands yet (Phase 3) | | 4 | S |
| 6.13-06 | 6.13 Calls | Entry: Start a call in channel details | Not started (later phase) | See 6.10-34 | | 4 | S |
| 6.13-07 | 6.13 Calls | Sidebar call bar: green dot | Not started (later phase) | none | | 4 | S |
| 6.13-08 | 6.13 Calls | Sidebar call bar: "Call in #backend" | Not started (later phase) | none | | 4 | S |
| 6.13-09 | 6.13 Calls | Sidebar call bar: elapsed time | Not started (later phase) | none (`useNow` and `formatClock` exist) | | 4 | S |
| 6.13-10 | 6.13 Calls | Sidebar call bar: facepile | Not started (later phase) | `Avatar` facepile primitive exists (`primitives.test.tsx:82`) | | 4 | S |
| 6.13-11 | 6.13 Calls | Sidebar call bar: mute button | Not started (later phase) | none | | 4 | S |
| 6.13-12 | 6.13 Calls | Sidebar call bar: camera button | Not started (later phase) | none | | 4 | S |
| 6.13-13 | 6.13 Calls | Sidebar call bar: share button | Not started (later phase) | none | | 4 | S |
| 6.13-14 | 6.13 Calls | Sidebar call bar: leave button in `accent-fill` | Not started (later phase) | none | | 4 | S |
| 6.13-15 | 6.13 Calls | Floating window 440px, Ink 950, `shadow-modal` | Not started (later phase) | none | | 4 | M |
| 6.13-16 | 6.13 Calls | Participant tiles | Not started (later phase) | none | | 4 | M |
| 6.13-17 | 6.13 Calls | Speaking ring in `red-400` | Not started (later phase) | none | | 4 | S |
| 6.13-18 | 6.13 Calls | Mic state on each tile | Not started (later phase) | none | | 4 | S |
| 6.13-19 | 6.13 Calls | Live captions | OPEN | Blocked on §13 Q5 (captions and transcripts provider) | Needs the provider decision | 4 | L |
| 6.13-20 | 6.13 Calls | Window control: mute | Not started (later phase) | none | | 4 | S |
| 6.13-21 | 6.13 Calls | Window control: camera | Not started (later phase) | none | | 4 | S |
| 6.13-22 | 6.13 Calls | Window control: share screen | Not started (later phase) | none | | 4 | M |
| 6.13-23 | 6.13 Calls | Window control: react | Not started (later phase) | none | | 4 | S |
| 6.13-24 | 6.13 Calls | Window control: invite | Not started (later phase) | none | | 4 | S |
| 6.13-25 | 6.13 Calls | Window control: chat | Not started (later phase) | none | | 4 | S |
| 6.13-26 | 6.13 Calls | Window control: Leave | Not started (later phase) | none | | 4 | S |
| 6.13-27 | 6.13 Calls | Channel's sidebar row shows a phone icon in `presence-active` during a call | Not started (later phase) | `Sidebar.tsx:229-250` `ChannelLink` has no call state | | 4 | S |
| 6.13-28 | 6.13 Calls | Tech: WebRTC with an SFU | OPEN | Blocked on §13 Q5 (SFU choice: self-hosted or managed) | | 4 | L |
| 6.13-29 | 6.13 Calls | Tech: signalling over the existing WebSocket | Not started (later phase) | `src/lib/realtime.ts` carries chat events only | Add call signalling events | 4 | M |
| 6.13-30 | 6.13 Calls | OPEN: recording | OPEN | §13 Q5 | | 4 | L |
| 6.13-31 | 6.13 Calls | OPEN: captions provider | OPEN | §13 Q5 | | 4 | M |
| 6.14-01 | 6.14 Page tab | A collaborative Flow page attached to the channel | Partial | `ChannelTabs.tsx:11, 32` Page tab exists as a stub ("This channel's page will live here."); channels only, not DMs (`:16`) | No page, no editor, no storage. No existing Pages editor in the repo to reuse | 4 | L |
| 6.14-02 | 6.14 Page tab | Toolbar: text style | Not started (later phase) | none | | 4 | M |
| 6.14-03 | 6.14 Page tab | Toolbar: bold | Not started (later phase) | none | | 4 | S |
| 6.14-04 | 6.14 Page tab | Toolbar: italic | Not started (later phase) | none | | 4 | S |
| 6.14-05 | 6.14 Page tab | Toolbar: checklist | Not started (later phase) | none | | 4 | S |
| 6.14-06 | 6.14 Page tab | Toolbar: table | Not started (later phase) | none | | 4 | M |
| 6.14-07 | 6.14 Page tab | Toolbar: link task | Not started (later phase) | none | | 4 | M |
| 6.14-08 | 6.14 Page tab | Save state ("Saved · Nour is editing") | Not started (later phase) | none | | 4 | M |
| 6.14-09 | 6.14 Page tab | Collaborators | Not started (later phase) | none | | 4 | M |
| 6.14-10 | 6.14 Page tab | Share | Not started (later phase) | none | | 4 | S |
| 6.14-11 | 6.14 Page tab | History | Not started (later phase) | none | | 4 | M |
| 6.14-12 | 6.14 Page tab | Content in a 760px column | Not started (later phase) | none | | 4 | S |
| 6.14-13 | 6.14 Page tab | Content: headings | Not started (later phase) | none | | 4 | S |
| 6.14-14 | 6.14 Page tab | Content: lists | Not started (later phase) | none | | 4 | S |
| 6.14-15 | 6.14 Page tab | Content: tables | Not started (later phase) | none | | 4 | M |
| 6.14-16 | 6.14 Page tab | Content: checklists | Not started (later phase) | none | | 4 | S |
| 6.14-17 | 6.14 Page tab | Content: task chips | Not started (later phase) | Task chips exist in messages (`MessageBody.tsx`), not in a page | | 4 | M |
| 6.14-18 | 6.14 Page tab | Content: @mentions | Not started (later phase) | none | | 4 | S |
| 6.14-19 | 6.14 Page tab | Reuse Flow's existing Pages editor if one exists | Not started (later phase) | No Pages editor under `src/pages` (chat, dashboard, home, projects, settings, tasks, teams, time) | Nothing to reuse; confirm with the team whether one exists outside this repo | 4 | S |
| 6.14-20 | 6.14 New channel | Intro: `display` "# name" at the start of history | Not started (later phase) | No intro in `MessageList.tsx` or `ChannelFeed.tsx` (grep "very beginning" finds only the date-jump menu, `MessageList.tsx:456`) | | 4 | S |
| 6.14-21 | 6.14 New channel | Intro text "You created this channel today. This is the very beginning of #name." | Not started (later phase) | none | | 4 | S |
| 6.14-22 | 6.14 New channel | "Edit description" link | Not started (later phase) | The edit exists in Channel details (`ChannelDetails.tsx:385`) | | 4 | S |
| 6.14-23 | 6.14 New channel | Button: Add people | Not started (later phase) | The Add people modal exists (`ChannelMembers.tsx`) | Wire a button to it | 4 | S |
| 6.14-24 | 6.14 New channel | Button: Pick a template | Not started (later phase) | none | | 4 | S |
| 6.14-25 | 6.14 New channel | Button: Link a project | Not started (later phase) | none (also no link route, see 6.10-48) | | 4 | M |
| 6.14-26 | 6.14 New channel | Template card: Project kickoff (page, task list, weekly check-in automation) | Not started (later phase) | none | | 4 | M |
| 6.14-27 | 6.14 New channel | Template card: Incident (timeline page, action items, status form) | Not started (later phase) | none | | 4 | M |
| 6.14-28 | 6.14 New channel | Template card: Release (checklist page, "post when a task ships" automation) | Not started (later phase) | none | | 4 | M |
| 6.14-29 | 6.14 Task list / Automations | Task list (Pro): entry point from the attach menu and templates | OPEN | Attach menu has only "Upload from your computer" (`RichComposer.tsx:328-331`); Pro gating is §13 Q7 | Needs its own spec and the plan-gating decision | 4 | M |
| 6.14-30 | 6.14 Task list / Automations | Automations: entry point from the attach menu and templates | Not started (later phase) | none | Needs its own spec before it is built | 4 | M |
| 6.15-01 | 6.15 Toast | Ink 950 in both themes | Done | `Toast.tsx:72` `bg-sf-ink-950 text-sf-white`; dark adds the 1px `ink-700` ring as the reference | | 0 | — |
| 6.15-02 | 6.15 Toast | `radius-lg` | Done | `Toast.tsx:72` `rounded-sf-lg` | | 0 | — |
| 6.15-03 | 6.15 Toast | `shadow-menu` | Done | `Toast.tsx:72` `shadow-sf-menu` | | 0 | — |
| 6.15-04 | 6.15 Toast | An icon | Done | `Toast.tsx:74` optional icon, `text-sf-white`; delete passes `IconTrash` (`MessageActions.tsx:78`) | | 0 | — |
| 6.15-05 | 6.15 Toast | The text | Done | `Toast.tsx:75`; `.sf-toast` 14/20, min-height 44, padding 8/8/8/16 (`Toast.tsx:72`) | | 0 | — |
| 6.15-06 | 6.15 Toast | At most one action in `red-400` (Undo) | Done | `Toast.tsx:13, 76-87` one `action`, `text-sf-red-400`, hover `ink-800`; `layers.test.tsx:212` | | 0 | — |
| 6.15-07 | 6.15 Toast | × | Done | `Toast.tsx:88` "Dismiss" `IconButton` tone `ink` (`ink-300`, `Button.tsx:57`) | | 0 | — |
| 6.15-08 | 6.15 Toast | Bottom-start of the main card | Done | `Toast.tsx:42` `lg:absolute lg:start-4 lg:bottom-4`; the region sits inside the relative main card (`AppLayout.tsx:40, 68`); phones: fixed above the bottom bar (`bottom-24`) | | 0 | — |
| 6.15-09 | 6.15 Toast | Lasts 5s | Done | `Toast.tsx:7` `TOAST_MS = 5000`, `:56`; `layers.test.tsx:212` | | 0 | — |
| 6.15-10 | 6.15 Toast | Paused on hover or focus | Done | `Toast.tsx:49-64, 68-71` pointer and focus counters, remaining time kept; `layers.test.tsx:212` | | 0 | — |
| 6.15-11 | 6.15 Toast | `role="status"` | Done | `Toast.tsx:42` `role="status" aria-live="polite"` on an always-mounted region | | 0 | — |
| 6.15-12 | 6.15 Tooltip | Ink 950 background | Done | `Tooltip.tsx:94` `bg-sf-ink-950`, `rounded-sf-md`, `px-2 py-1`, `max-w-60` (240px), 1px `ink-700` ring = `.sf-tooltip` | | 0 | — |
| 6.15-13 | 6.15 Tooltip | White 12/500 text | Done | `Tooltip.tsx:94` `text-[12px]/[16px] font-medium text-sf-white` | | 0 | — |
| 6.15-14 | 6.15 Tooltip | `ink-300` secondary line | Done | `Tooltip.tsx:104` `sub` in `text-sf-ink-300 font-normal` | | 0 | — |
| 6.15-15 | 6.15 Tooltip | Shortcut in a kbd chip | Done | `Tooltip.tsx:98-102` `Kbd onDark` (`Badge.tsx:47-59` = `.sf-tooltip .sf-kbd`) | | 0 | — |
| 6.15-16 | 6.15 Tooltip | Shows after 500ms of hover | Done | `Tooltip.tsx:6, 56` `TOOLTIP_DELAY_MS = 500`; touch pointers skipped; `primitives.test.tsx:48` | | 0 | — |
| 6.15-17 | 6.15 Tooltip | Shows at once on keyboard focus | Done | `Tooltip.tsx:62-65` `:focus-visible` shows it with no delay; `primitives.test.tsx:48` | | 0 | — |
| 6.16-01 | 6.16 Mobile | Single-pane navigation: chat list → channel → thread | Different from spec | The "list" is the sidebar drawer (`MobileNav.tsx:78-96`) opened from a top-bar hamburger; the thread is a bottom sheet (`InspectorFrame.tsx:34` `h-[85vh] rounded-t-2xl`) over the channel | No chat-list screen; the thread is not a full pane | 4 | L |
| 6.16-02 | 6.16 Mobile | Each pane full screen with a back button | Different from spec | Channel is full screen (`AppLayout.tsx:32, 52-54`) but has no back button (`ChannelHeader.tsx`); the thread closes with × (`InspectorFrame.tsx:42`) | No back button on the channel or the thread | 4 | M |
| 6.16-03 | 6.16 Mobile | Touch targets at least 44px | Partial | Done for tabs (`Tabs.tsx:27`), `Button touch` (`Button.tsx:21-38`), Modal × (`Modal.tsx:88`), drawer rows (`Sidebar.tsx:102` `h-11`), chips, Activity switch; tests `a11y.browser.test.tsx:374, 622, 648, 684, 762, 860` | [app check] Still under 44px on phones: composer toolbar icon buttons (`RichComposer.tsx:328-358`, 28px), header star, bell and ⋮ (`ChannelHeader.tsx:90-97, 123-132`), the thread's "Also send" checkbox (`Toggle.tsx:58-63`), the panel's close (`InspectorFrame.tsx:42`) | 4 | M |
| 6.16-04 | 6.16 Mobile | Don't draw a status bar | Done | No status-bar element in `AppLayout.tsx`, `TopBar.tsx` or `MobileNav.tsx` | | 4 | — |
| 6.16-05 | 6.16 Chat list | Dark header: workspace name ▾ | Not started (later phase) | Top bar is the light `bg-sf-surface` bar (`TopBar.tsx:24`) with `WorkspaceSwitcher` (`:44`); the drawer header is the logo and × (`MobileNav.tsx:87-90`) | No dark chat-list header | 4 | M |
| 6.16-06 | 6.16 Chat list | Dark header: avatar | Not started (later phase) | `UserMenu` in the light top bar (`TopBar.tsx:45`) | | 4 | S |
| 6.16-07 | 6.16 Chat list | Dark header: search | Not started (later phase) | `PhoneSearch` in the light top bar (`TopBar.tsx:42`) | | 4 | S |
| 6.16-08 | 6.16 Chat list | Chip: Threads | Not started (later phase) | Threads link only behind `chatRedesign`, desktop sidebar (`Sidebar.tsx:306-308`); view not built | | 4 | S |
| 6.16-09 | 6.16 Chat list | Chip: Drafts | Not started (later phase) | `Sidebar.tsx:315-317` behind flag; view not built | | 4 | S |
| 6.16-10 | 6.16 Chat list | Chip: Saved | Not started (later phase) | `Sidebar.tsx:318-320` behind flag; view not built | | 4 | S |
| 6.16-11 | 6.16 Chat list | Channels as 48px rows | Different from spec | Drawer rows are `h-11` = 44px (`Sidebar.tsx:102`) | 44px, not 48px | 4 | S |
| 6.16-12 | 6.16 Chat list | DMs as 60px rows with a last-message preview | Not started (later phase) | DM rows use the same 44px `ChannelLink` (`Sidebar.tsx:229-250`), no preview | | 4 | M |
| 6.16-13 | 6.16 Chat list | Compose button: 56px, `accent-fill`, `radius-lg` | Not started (later phase) | New message is a small "+" in the Direct messages section (`Sidebar.tsx:362`); `SidebarHeader` compose is desktop-only | | 4 | S |
| 6.16-14 | 6.16 Chat list | Bottom tab: Home | Done | `MobileNav.tsx:59` | | 4 | — |
| 6.16-15 | 6.16 Chat list | Bottom tab: Chat | Done | `MobileNav.tsx:65` | | 4 | — |
| 6.16-16 | 6.16 Chat list | Bottom tab: Activity | Not started (later phase) | Not in `MobileBottomBar` (`MobileNav.tsx:57-73`) | | 4 | S |
| 6.16-17 | 6.16 Chat list | Bottom tab: Tasks | Different from spec | `MobileNav.tsx:62` has "Projects" in its place (also lit for My tasks, `:46`) | A Tasks tab (My tasks) instead of Projects | 4 | S |
| 6.16-18 | 6.16 Chat list | Bottom tab: More | Done | `MobileNav.tsx:67-71` opens the drawer | | 4 | — |
| 6.16-19 | 6.16 Channel | Header: back | Not started (later phase) | No back control in `ChannelHeader.tsx`; the top bar shows the menu button (`TopBar.tsx:25-27`) | | 4 | S |
| 6.16-20 | 6.16 Channel | Header: `# name` | Done | `ChannelHeader.tsx:71-88` | | 4 | — |
| 6.16-21 | 6.16 Channel | Header: "8 members · 5 active" | Not started (later phase) | Members button is hidden below 560px (`ChannelHeader.tsx:186`) and counts members only; no active count | | 4 | M |
| 6.16-22 | 6.16 Channel | Header: call | Not started (later phase) | See 6.13-01 | | 4 | S |
| 6.16-23 | 6.16 Channel | Header: search | Not started (later phase) | See 6.12-05 | | 4 | S |
| 6.16-24 | 6.16 Channel | Messages at 16px side padding | Done | `ChannelMessage.tsx:242` `px-4 md:px-6` (reference `.sf-msg` 16px on phones) | | 4 | — |
| 6.16-25 | 6.16 Channel | Composer: round + | Not started (later phase) | The phone composer is the desktop one; + Attach is a 28px `rounded-md` icon button in the toolbar under the input (`RichComposer.tsx:328`) | | 4 | S |
| 6.16-26 | 6.16 Channel | Composer: pill-shaped input | Not started (later phase) | Desktop box with toolbar row (`RichComposer.tsx:296-311, 326`) | | 4 | M |
| 6.16-27 | 6.16 Channel | Composer: mic or send | Partial | Send button exists (`RichComposer.tsx:399-411`) | No mic (voice messages are Phase 4) | 4 | M |
| 6.16-28 | 6.16 Thread | Composer with "Also send to #channel" | Done | `ThreadComposer.tsx:65-67` `Checkbox` "Also send to {sendTo}" | | 4 | — |
| 6.16-29 | 6.16 Thread | "Also send" as a 44px checkbox row | Different from spec | `Toggle.tsx:58-63` `Checkbox` is an inline row with a 16px box and 13px text, no 44px minimum | [app check] About 18px tall on a phone; add `max-md:min-h-11` | 4 | S |

#### Notes

- Approved rulings applied: no success toast on Add people (CLAUDE.md: "Toast is only for Undo after a delete"); linked project read-only (slice 4); no Tabs, Integrations or Start a call in Channel details (slice 4); Reminders tab hidden, keywords, Desktop/mobile/email and Do Not Disturb deferred to Preferences (slice 3). I found no single "toast on Add people" line in `tasks/todo.md`; the evidence is the CLAUDE.md rule, the comment in `ChannelHeader.tsx:55` ("there are no toasts outside Undo") and the slice 5 verification.
- The only toast in the app is the delete Undo (`MessageActions.tsx:74-81`). A failed Undo also raises a second, action-less toast (`:80`), which is a toast outside the "Undo only" rule, though part of the same flow.
- Section 12 gives no phase to the delivery channels in 6.11 (desktop, push, email digest) or to Do Not Disturb. I filed them under Phase 2 with the popover and marked them Missing; if the team treats them as part of Preferences (later), they become "Not started (later phase)".
- Phase 3 views (Search, Saved, Drafts & sent, Threads) are entirely unbuilt: no routes in `src/router.tsx:72-83` and no API for search, saved items or scheduled sends. The sidebar rows for Threads, Drafts & sent and Saved sit behind the `chatRedesign` flag (`Sidebar.tsx:306-320`) and link to routes that don't exist, so turning the flag on gives a not-found page.
- Modal: the scrim never closes the dialog (stricter than the spec's "unsaved input" rule). Focus can leave the dialog after a scrim click (6.10-09).
- Channel details: the Settings tab shows to anyone who may manage the channel (members, or Admins on public channels), not only admins; only the Who can post radios are admin-gated. Leave channel has no confirmation (the spec doesn't ask for one). Details are not offered for DMs (slice 4 ruling), while the header bell works for DMs.
- Add people: "Add 1 person" for N=1 (spec says "Add N people"); the default-channel switch saves at once, even if the window is then cancelled.
- Activity header end padding is 12px, the reference `.sf-view-head` is 16px; the reference `.sf-view-body` top padding (8px) is not applied. Small, [app check].
- `MobileBottomBar` and `MobileDrawer` still use CRM tokens (`border-line`, `bg-surface`, `text-accent`) and lucide icons in the bottom bar, not the sf primitives; the spec'd mobile screens (chat list, DM preview rows, compose button, pill composer) are all unbuilt, consistent with Phase 4.
- Calls: the `SplitButton` primitive (Phase 0) is built but unused outside `/dev/ui`. §13 Q5 (SFU, recording, captions) blocks the live captions, SFU, recording and captions-provider items.

### Audit F: FLOW_CHAT_REDESIGN.md §7 Data model, §8 API and real-time contract, §9 Permissions

Paths are relative to `spark-flow-web/`. "Equivalent" means the spec's name maps to an existing repo name (spec `channel_id` is `channelId`; `author_id` is `senderId`; ChannelMember state lives in `DbData.channelState[userId][channelId]`, members in `Channel.memberIds`). Server-to-client events carry one shared gap: with the backend on, `src/lib/realtime.ts:66-96` `createUnconnectedClient` is a no-op (no SignalR), so no event arrives and typing is never sent. That is recorded as `Transport` in each event row and once as item 8-81.

#### §7 Data model

| ID | Section | Requirement | Status | Evidence | Gap | Phase | Effort |
|---|---|---|---|---|---|---|---|
| 7-01 | 7 | Channel entity | Done | `Channel` / `StoredChannel` src/api/types.ts:132-147, 265; `DbData.channels` src/mocks/db.ts:52 | | 1 | — |
| 7-02 | 7 | Channel `type` (public, private, dm, group_dm) | Done | Equivalent: `kind` 'channel' \| 'dm' + `isPrivate` (types.ts:131,135); a group DM is a `dm` with 3 to 9 `memberIds` (src/mocks/chat.ts:326-348 `openDm`) | | 1 | — |
| 7-03 | 7 | Channel `name` | Done | `name: string \| null`, null for DMs (types.ts:134) | | 1 | — |
| 7-04 | 7 | Channel `topic` | Done | types.ts:135; `updateChannel` chat.ts:365 | | 1 | — |
| 7-05 | 7 | Channel `description` | Done | types.ts:142; DB v13 migration migrations.ts:95; max 250, chat.ts:373 | | 2 | — |
| 7-06 | 7 | Channel `archived_at` | Done | Equivalent: `archivedAt` types.ts:138; `setArchived` chat.ts:296 | | 2 | — |
| 7-07 | 7 | Channel `linked_project_id` | Different from spec (approved ruling: slice 4 "linked project read-only (no linking for other channels yet)", tasks/todo.md slice 4) | The link is the reverse key `Project.channelId` (types.ts:21), found with `data.projects.find(p => p.channelId === id)` (chat.ts:199) and `useChannelProject` (src/pages/chat/ChannelActions.tsx:31) | Channel has no `linkedProjectId`; only a project's own channel is linked, one to one; other channels can't be linked or changed (contract api-contract.md:287) | 2 | M |
| 7-08 | 7 | Channel `is_default` | Done | Equivalent: `isDefault` types.ts:146; DB v14 migrations.ts:103; seed #general seed.ts:315; Admin-only change chat.ts:381-387 | | 2 | — |
| 7-09 | 7 | ChannelMember entity (per-user channel state) | Done | Equivalent: `ChannelMemberState` types.ts:166 kept in `DbData.channelState` db.ts:65 (userId, then channelId); membership is `Channel.memberIds` | | 1 | — |
| 7-10 | 7 | ChannelMember `role` | Missing | No per-member role anywhere (types.ts:166; permissions.ts:51 treats every member as a manager) [phase inferred: §9 roles + Members tab, no §12 line names it] | No channel role (owner, admin, member); every member can edit details, add and remove people | 2 | M |
| 7-11 | 7 | ChannelMember `notify_level` (all, mentions, none) | Done | Equivalent: `notifyLevel` types.ts:164-166; default by kind membership.ts:6; `setNotifyLevel` chat.ts:719; migration 12 migrations.ts:86 | | 2 | — |
| 7-12 | 7 | ChannelMember `muted` | Done | `muted` types.ts:166; `setMuted` chat.ts:718 | | 1 | — |
| 7-13 | 7 | ChannelMember `starred` | Done | `starred` types.ts:166; `setStarred` chat.ts:717 | | 1 | — |
| 7-14 | 7 | ChannelMember `last_read_seq` | Done | Equivalent: `lastReadSeq` types.ts:166; `channelState` db.ts:65; migration 7 migrations.ts:41-63; `markRead` chat.ts:695 | | 1 | — |
| 7-15 | 7 | ChannelMember `sidebar_position` | Not started (later phase) | No field in types.ts:166 or `channelState` | Needed for drag-to-reorder in Starred and Channels | 3 | S |
| 7-16 | 7 | Message entity | Done | `ChatMessage` types.ts:168-199; `DbData.messages` db.ts:53 | | 1 | — |
| 7-17 | 7 | Message `id` (client-generated UUID accepted) | Different from spec | Server makes the id (`newId('m')` chat.ts:743); the client's UUID travels as a separate `clientId` stored on the message (types.ts:173; chat.ts:746; sendQueue.ts:7; contract api-contract.md:16, 42) | The client's UUID is not the message id. Idempotency is by `(sender, clientId)`, which works but differs from the spec's wording. Thread replies carry no client id at all (src/api/chat.ts:256-261; http.ts:106) | 1 | S |
| 7-18 | 7 | Message `channel_id` | Done | Equivalent: `channelId` types.ts:169 | | 1 | — |
| 7-19 | 7 | Message `seq` (monotonic per channel) | Done | `seq` types.ts:171; assigned `lastSeqOf + 1` inside the write transaction chat.ts:745; migration 7; contract api-contract.md:15 | | 1 | — |
| 7-20 | 7 | Message `author_id` | Done | Equivalent: `senderId` types.ts:169 | | 1 | — |
| 7-21 | 7 | Message `parent_id` (thread root, null for top level) | Different from spec | Replies are a separate collection: `ThreadReply.messageId` is the parent (types.ts:245-253; `DbData.replies` db.ts:54); a message has no `parentId` | Structure differs from the spec's single Message table. The API shape matches (`GET/POST /messages/:id/replies`). Document the mapping for the backend team | 2 | S |
| 7-22 | 7 | Message `also_in_channel` (bool) | Done | Equivalent: `ThreadReply.alsoInChannel` + `seq` (types.ts:251-252) and a stub message with `broadcast: { rootId, rootText }` in `messages` (types.ts:198; chat.ts:788-796) | | 2 | — |
| 7-23 | 7 | Message `body` (structured rich text JSON) | Done | `body: Body` types.ts:175; `Block`/`Inline` src/lib/messageBody.ts:19-34; migration 8 migrations.ts:65 | | 1 | — |
| 7-24 | 7 | Message `body_text` (plain, for search and notifications) | Done | Equivalent: `content` (types.ts:174), derived on write by `bodyText(body)` (chat.ts:168-173; messageBody.ts:171) | | 1 | — |
| 7-25 | 7 | Message `kind` (user, system, bot) | Partial | `system?: SystemEvent` marks system messages (types.ts:179; `postSystem` chat.ts:766); cards use `commentId` / `taskEvent` (types.ts:184,186) | No single `kind` field; no `bot` (Flowbot DMs come with Remind me, Phase 3; Apps, Phase 4) | 1 | S |
| 7-26 | 7 | Message `created_at` | Done | `createdAt` types.ts:182 | | 1 | — |
| 7-27 | 7 | Message `edited_at` | Done | `editedAt` types.ts:182; set in `edit` chat.ts:509 | | 1 | — |
| 7-28 | 7 | Message `deleted_at` | Done | `deletedAt` types.ts:188; `remove` chat.ts:542 | | 1 | — |
| 7-29 | 7 | Message: soft delete | Done | The row stays with empty text, files, reactions; content kept in `DbData.trash` for Undo (db.ts:74; chat.ts:519-547); `restore` chat.ts:548 | Retention beyond the Undo window is OPEN item 8; `trash` is only pruned on the next delete (chat.ts:529) | 1 | — |
| 7-30 | 7 | Thread (denormalised on the parent) | Done | `threadCount`, `lastReplyAt`, `replyUserIds` on `ChatMessage` (types.ts:177,181) | | 2 | — |
| 7-31 | 7 | Thread `reply_count` | Done | Equivalent: `threadCount`, incremented in `postReply` chat.ts:809, inside the same `db.update` as the reply is stored (chat.ts:583-596) | | 2 | — |
| 7-32 | 7 | Thread `last_reply_at` | Done | Equivalent: `lastReplyAt` set at chat.ts:810 | | 2 | — |
| 7-33 | 7 | Thread `reply_user_ids` (latest 5) | Done | Equivalent: `replyUserIds` types.ts:177, worked out on every read (newest first, each once, `REPLY_FACES = 5`) chat.ts:64,105-108; contract api-contract.md:105 allows read-time or stored | | 2 | — |
| 7-34 | 7 | Thread fields updated in the same transaction as each reply | Done | `postReply` updates count and last reply time inside the reply's `db.update` (chat.ts:771-813); `replyUserIds` is derived on read | | 2 | — |
| 7-35 | 7 | ThreadFollow entity | Done | `ThreadFollow` types.ts:202; `DbData.threadFollows` db.ts:76; migration 11 migrations.ts:81 | | 2 | — |
| 7-36 | 7 | ThreadFollow `user_id` | Done | `userId` types.ts:202 | | 2 | — |
| 7-37 | 7 | ThreadFollow `root_id` | Done | `rootId` types.ts:202 | | 2 | — |
| 7-38 | 7 | ThreadFollow `following` | Done | `following` types.ts:202; `setFollowing` chat.ts:597 | | 2 | — |
| 7-39 | 7 | ThreadFollow `last_read_seq` | Not started (later phase) | Absent from types.ts:202 | No per-thread read marker; needed by the Threads view's unread state (Phase 3) | 3 | M |
| 7-40 | 7 | Reaction entity | Done | `Reaction = { emoji, userIds[] }` embedded in `reactions` of messages and replies (types.ts:129, 180, 247) | | 2 | — |
| 7-41 | 7 | Reaction `message_id` | Done | Equivalent: the reaction lives inside its message or reply row | | 2 | — |
| 7-42 | 7 | Reaction `user_id` | Done | Equivalent: `userIds` entries (types.ts:129) | | 2 | — |
| 7-43 | 7 | Reaction `emoji` | Done | `emoji` types.ts:129; validated by `isOneEmoji` chat.ts:479 | | 2 | — |
| 7-44 | 7 | Reaction unique (message, user, emoji) | Done | `toggleReaction` src/lib/reactions.ts:15-20 adds the user once per emoji | | 2 | — |
| 7-45 | 7 | Reaction app-level cap of 50 distinct emoji per message | Done | `MAX_DISTINCT_REACTIONS = 50` reactions.ts:7; refusal chat.ts:485 | | 2 | — |
| 7-46 | 7 | Mention entity (drives badges and Activity) | Done | `Mention` types.ts:128 embedded as `mentions` on messages and replies; `mentionsFor` src/mocks/mentions.ts:36; Activity src/mocks/activityFeed.ts:20; sidebar counts src/layout/useSidebarGroups.ts:46 | | 1 | — |
| 7-47 | 7 | Mention `message_id` | Done | Equivalent: embedded in the message or reply row | | 1 | — |
| 7-48 | 7 | Mention `user_id` | Done | `{ kind: 'user', id }` types.ts:128 | | 1 | — |
| 7-49 | 7 | Mention `group` = here | Missing | Kinds are `user`, `project`, `task`, `all` only (types.ts:128; src/lib/messageBody.ts:19-27); no `@here` anywhere in src | No `@here` (notify active members) | 1 | M |
| 7-50 | 7 | Mention `group` = channel | Different from spec | `{ kind: 'all' }`, typed `@all` (messageBody.ts:22; AutocompletePlugin.tsx:168; CLAUDE.md names `@all` as the project's syntax) | Spec says `@channel`. Needs an alias or rename, and the "confirm before more than 25 members" prompt belongs to the composer item | 1 | S |
| 7-51 | 7 | Mention `group` = usergroup id | Missing | No user-group mention kind. Teams exist (`Team` types.ts:9) and Add people already suggests them (todo.md slice 5) | `@team` mention not modelled | 1 | M |
| 7-52 | 7 | File entity | Done | `Attachment` types.ts:101-109, one record for chat, comment and project files; `DbData.attachments` db.ts:59 | | 2 | — |
| 7-53 | 7 | File `storage_key` | Done | Equivalent: the bytes sit in the file store under the file `id` (`db.putFile(id, …)`, src/mocks/db.ts:101,274; `withSavedBytes` src/mocks/files.ts:28-33); the key is server-internal and not on the type | | 2 | — |
| 7-54 | 7 | File `name` | Done | `name` types.ts:102 | | 2 | — |
| 7-55 | 7 | File `mime` | Done | Equivalent: `mimeType` types.ts:102; contract api-contract.md:336 (server-sniffed) | | 2 | — |
| 7-56 | 7 | File `size` | Done | `size` types.ts:102 | | 2 | — |
| 7-57 | 7 | File `uploader_id` | Done | Equivalent: `uploadedBy` types.ts:103; migration 15 migrations.ts:112 | | 2 | — |
| 7-58 | 7 | File `title` | Done | `title` types.ts:103; `fileTitleError` src/lib/fileDetails.ts | | 2 | — |
| 7-59 | 7 | File `description` | Done | `description` types.ts:103 | | 2 | — |
| 7-60 | 7 | File `folder_id` | Not started (later phase) | Absent from types.ts:101-109; contract api-contract.md:372 says "Add to folder" comes with the Files tab (Phase 3) | | 3 | M |
| 7-61 | 7 | File `thumb_key` | Partial | Equivalent: `thumbUrl` (+ `previewUrl`) types.ts:106 | `fileRecord` always sets `thumbUrl: null` (src/mocks/files.ts:45) and no component reads it (only `previewUrl`, src/pages/chat/MessageFiles.tsx:196); the backend creates thumbnails | 2 | S |
| 7-62 | 7 | File `scan_status` | Done | Equivalent: `scanStatus` 'pending' \| 'clean' \| 'blocked' types.ts:96,104; enforced in send/open/share (chat.ts:187-188; files.ts:143-144,272) | | 2 | — |
| 7-63 | 7 | MessageFile entity | Done | Equivalent: `attachments: Attachment[]` embedded in messages and replies (types.ts:180,247); copies kept in step by `changeEverywhere` src/mocks/files.ts:108; contract api-contract.md:344 | | 2 | — |
| 7-64 | 7 | MessageFile `message_id` | Done | Equivalent: the row that holds the array | | 2 | — |
| 7-65 | 7 | MessageFile `file_id` | Done | Equivalent: `attachments[].id` | | 2 | — |
| 7-66 | 7 | MessageFile `position` | Done | Equivalent: array order, at most 10 (`MAX_MESSAGE_FILES`, chat.ts:182) | | 2 | — |
| 7-67 | 7 | Pin entity | Not started (later phase) | No Pin type in types.ts, db.ts or mocks; Pins tab is a stub (src/pages/chat/ChannelTabs.tsx:31) | | 3 | M |
| 7-68 | 7 | Pin `channel_id` | Not started (later phase) | Absent | | 3 | — |
| 7-69 | 7 | Pin `message_id` | Not started (later phase) | Absent | | 3 | — |
| 7-70 | 7 | Pin `pinned_by` | Not started (later phase) | Absent | | 3 | — |
| 7-71 | 7 | Pin `pinned_at` | Not started (later phase) | Absent | | 3 | — |
| 7-72 | 7 | SavedItem entity | Not started (later phase) | No type; the sidebar "Saved" link is hidden behind `chatRedesign` (src/layout/Sidebar.tsx:319; src/lib/features.ts) | | 3 | M |
| 7-73 | 7 | SavedItem `user_id` | Not started (later phase) | Absent | | 3 | — |
| 7-74 | 7 | SavedItem `message_id` or `file_id` | Not started (later phase) | Absent | | 3 | — |
| 7-75 | 7 | SavedItem `status` (in_progress, archived, completed) | Not started (later phase) | Absent | | 3 | — |
| 7-76 | 7 | SavedItem `remind_at` | Not started (later phase) | Absent | | 3 | — |
| 7-77 | 7 | Reminder entity | Not started (later phase) | No type; Activity's Reminders tab is deferred (src/pages/chat/activityRows.ts:6) | Fired by a scheduler that posts a Flowbot DM | 3 | M |
| 7-78 | 7 | Reminder `user_id` | Not started (later phase) | Absent | | 3 | — |
| 7-79 | 7 | Reminder `message_id` | Not started (later phase) | Absent | | 3 | — |
| 7-80 | 7 | Reminder `remind_at` | Not started (later phase) | Absent | | 3 | — |
| 7-81 | 7 | Reminder `fired_at` | Not started (later phase) | Absent | | 3 | — |
| 7-82 | 7 | Draft entity | Done | `Draft` types.ts:205; stored as `DbData.drafts` (adds `id`, `userId`) db.ts:72; migration 9 migrations.ts:73 | | 1 | — |
| 7-83 | 7 | Draft `user_id` | Done | `userId` on the stored row db.ts:72 | | 1 | — |
| 7-84 | 7 | Draft `channel_id` | Done | `channelId` types.ts:205 | | 1 | — |
| 7-85 | 7 | Draft `root_id` | Done | `rootId` types.ts:205 | | 1 | — |
| 7-86 | 7 | Draft `body` | Done | `body: Body` types.ts:205 | | 1 | — |
| 7-87 | 7 | Draft `updated_at` | Done | `updatedAt` types.ts:205; chat.ts:661 | | 1 | — |
| 7-88 | 7 | Draft unique per (user, channel, root) | Done | `saveDraft` finds the row by that triple and replaces it chat.ts:655-663 | | 1 | — |
| 7-89 | 7 | ScheduledMessage entity | Not started (later phase) | No type, no `Api` method | | 3 | M |
| 7-90 | 7 | ScheduledMessage `user_id` | Not started (later phase) | Absent | | 3 | — |
| 7-91 | 7 | ScheduledMessage `channel_id` | Not started (later phase) | Absent | | 3 | — |
| 7-92 | 7 | ScheduledMessage `root_id` | Not started (later phase) | Absent | | 3 | — |
| 7-93 | 7 | ScheduledMessage `body` | Not started (later phase) | Absent | | 3 | — |
| 7-94 | 7 | ScheduledMessage `send_at` | Not started (later phase) | Absent | | 3 | — |
| 7-95 | 7 | ScheduledMessage `tz` | Not started (later phase) | Absent (the client already sends `X-Time-Zone`, http.ts:27) | | 3 | — |
| 7-96 | 7 | ScheduledMessage `status` | Not started (later phase) | Absent | | 3 | — |
| 7-97 | 7 | Bookmark / ChannelTab entity | Not started (later phase) | No type; channel tabs are fixed client-side stubs (`?tab=files\|pins\|page`, ChannelTabs.tsx:24-37; contract api-contract.md:62) | | 3 | M |
| 7-98 | 7 | Bookmark `channel_id` | Not started (later phase) | Absent | | 3 | — |
| 7-99 | 7 | Bookmark `type` | Not started (later phase) | Absent | | 3 | — |
| 7-100 | 7 | Bookmark `title` | Not started (later phase) | Absent | | 3 | — |
| 7-101 | 7 | Bookmark `url` or `page_id` | Not started (later phase) | Absent (`page_id` is the Page tab, Phase 4) | | 3 | — |
| 7-102 | 7 | Bookmark `position` | Not started (later phase) | Absent | | 3 | — |
| 7-103 | 7 | Invitation entity | Done | `Invitation` types.ts:155-162; `DbData.invitations` db.ts:80; migration 14 migrations.ts:103 | | 2 | — |
| 7-104 | 7 | Invitation `email` | Done | `email`, trimmed and lowercased types.ts:157-158 | | 2 | — |
| 7-105 | 7 | Invitation `channel_id` | Done | `channelId` types.ts:156 | | 2 | — |
| 7-106 | 7 | Invitation `role` (guest, member) | Different from spec (approved ruling: slice 5 plan, `role 'guest'`; guests get their own slice, tasks/todo.md slice 5) | `role: 'guest'` only (types.ts:159); types.ts:152-153 says member waits for a workspace policy | `member` value not modelled | 2 | S |
| 7-107 | 7 | Invitation `invited_by` | Done | `invitedBy` types.ts:160 | | 2 | — |
| 7-108 | 7 | Invitation `status` | Done | `status` pending \| accepted \| revoked types.ts:161; revoke chat.ts:457 | Nothing in the prototype sets `accepted` (accepting is the guests slice) | 2 | — |
| 7-109 | 7 | Call entity (P2) | Not started (later phase) | No type | OPEN item 5 (SFU, recording, captions) blocks the provider choice | 4 | L |
| 7-110 | 7 | Call `channel_id` | Not started (later phase) | Absent | | 4 | — |
| 7-111 | 7 | Call `started_by` | Not started (later phase) | Absent | | 4 | — |
| 7-112 | 7 | Call `started_at` | Not started (later phase) | Absent | | 4 | — |
| 7-113 | 7 | Call `ended_at` | Not started (later phase) | Absent | | 4 | — |
| 7-114 | 7 | CallParticipant `user_id` | Not started (later phase) | Absent | | 4 | — |
| 7-115 | 7 | CallParticipant `joined_at` | Not started (later phase) | Absent | | 4 | — |
| 7-116 | 7 | CallParticipant `left_at` | Not started (later phase) | Absent | | 4 | — |
| 7-117 | 7 | NotificationPref entity | Not started (later phase) | Absent. Per-channel levels exist (7-11). The slice 3 ruling defers the rest: "keywords, desktop / mobile / email and Do Not Disturb wait for Preferences" (todo.md slice 3); §12 does not place Preferences [phase inferred] | | 3 | M |
| 7-118 | 7 | NotificationPref `user_id` | Not started (later phase) | Absent | | 3 | — |
| 7-119 | 7 | NotificationPref global level | Not started (later phase) | Absent | | 3 | — |
| 7-120 | 7 | NotificationPref keywords | Not started (later phase) | Absent ("Mentions and keywords" menu label exists, no keywords stored) | | 3 | — |
| 7-121 | 7 | NotificationPref DND schedule | Not started (later phase) | Absent | | 3 | — |
| 7-122 | 7 | NotificationPref email digest | Not started (later phase) | Absent | | 3 | — |
| 7-123 | 7 | Store `body` as structured rich text: blocks | Done | `Block`: `p`, `quote`, `ul`, `ol`, `code` src/lib/messageBody.ts:19-34; checked by `validBody` messageBody.ts:189-; round-trip with the composer (CLAUDE.md "Composer") | | 1 | — |
| 7-124 | 7 | Rich text: inline marks | Done | `Mark` b, i, u, s, code messageBody.ts:8; `canonical` order messageBody.ts:44 | | 1 | — |
| 7-125 | 7 | Rich text entity: mention | Done | `user` and `all` inlines messageBody.ts:19-21 (see 7-49, 7-50, 7-51 for here, channel naming and groups) | | 1 | — |
| 7-126 | 7 | Rich text entity: channel | Done | `{ type: 'channel', id, name }` messageBody.ts:23 | | 1 | — |
| 7-127 | 7 | Rich text entity: task_ref | Done | `{ type: 'task', key }` (and `project`) messageBody.ts:24-25; chips resolved by `tickets.resolve` | | 1 | — |
| 7-128 | 7 | Rich text entity: link | Done | `{ type: 'link', href, text }`, http and https only messageBody.ts:22; contract api-contract.md:87 | | 1 | — |
| 7-129 | 7 | Rich text entity: emoji | Different from spec | Emoji are plain unicode inside `text` nodes; `isJumbo` reads them from text (messageBody.ts:179-187). No `emoji` inline | Fine for unicode; a custom emoji (picker's "Custom" category) has no entity to hold it | 1 | S |
| 7-130 | 7 | Derive `body_text` on write | Done | `checkBody` → `bodyText` chat.ts:168-177; migration 8; contract api-contract.md:133 | | 1 | — |

#### §8 API and real-time contract

| ID | Section | Requirement | Status | Evidence | Gap | Phase | Effort |
|---|---|---|---|---|---|---|---|
| 8-01 | 8 | REST: `GET /channels/:id/messages?before=` | Done | `Api.chat.messagesBefore` types.ts:374; mock chat.ts:626; http.ts:94 `?before=<seq>`; contract api-contract.md:76; hook `useMessagesFrom` src/api/chat.ts:39 | | 1 | — |
| 8-02 | 8 | REST: `GET /channels/:id/messages?after=` | Done | `messagesAfter` mock chat.ts:630; http.ts:95; contract api-contract.md:75 | | 1 | — |
| 8-03 | 8 | REST: `GET /channels/:id/messages?around=` | Not started (later phase) | No `around` in types.ts, http.ts or the mock; contract api-contract.md:66 defers it to Jump to date and search hits (Phase 3). `jumpTarget` + `after` stand in (http.ts:99) | | 3 | M |
| 8-04 | 8 | REST: messages paged by cursor on `seq`, newest first | Done | `encodeCursor`/`decodeCursor` chat.ts:24-30, `olderPage` chat.ts:33; http.ts:92-93 `?cursor=`; contract api-contract.md:66 | | 1 | — |
| 8-05 | 8 | REST: `POST /channels/:id/messages` accepts a client id | Done | `Api.chat.send(…, clientId, …)`; mock chat.ts:565-582 returns the stored message for a repeat; http.ts:104; contract api-contract.md:35,42; event `messageReceived` chat.ts:578 | | 1 | — |
| 8-06 | 8 | REST: `PATCH /messages/:id` | Done | `Api.chat.edit`; mock chat.ts:493; http.ts:116 (`/api/messages/:id` or `/api/replies/:id`); contract api-contract.md:155; event `messageChanged` chat.ts:516 | | 1 | — |
| 8-07 | 8 | REST: `DELETE /messages/:id` (soft) | Done | `Api.chat.remove`; mock chat.ts:519; http.ts:117; contract api-contract.md:161; event `messageChanged` chat.ts:546 | | 1 | — |
| 8-08 | 8 | REST: `POST /messages/:id/restore` within the Undo window | Done | `Api.chat.restore`; mock chat.ts:548 (`UNDO_MS` 10 s, chat.ts:157); http.ts:118; contract api-contract.md:162 | | 1 | — |
| 8-09 | 8 | REST: `GET /messages/:id/replies` | Done | `Api.chat.replies`; mock chat.ts:689; http.ts:101; documented in the earlier spec docs/superpowers/specs/2026-10-26-spark-flow-shell-data-layer-design.md:209 and in passing at api-contract.md:198 | | 2 | — |
| 8-10 | 8 | REST: `POST /messages/:id/replies` with `also_in_channel` | Partial | `Api.chat.reply(…, alsoInChannel)`; mock chat.ts:583; http.ts:106-112; contract api-contract.md:191-200; events `replyReceived` chat.ts:593 | Equivalent name `alsoInChannel`. The request has no client id, so a retried reply after a lost response stores a second reply (spec §8 "writes are idempotent") | 2 | S |
| 8-11 | 8 | REST: follow a thread | Done | `Api.chat.setFollowing(id, true)`; mock chat.ts:597; http.ts:113 `PUT /messages/:id/follow`; contract api-contract.md:179; event `messageChanged` chat.ts:607 | | 2 | — |
| 8-12 | 8 | REST: unfollow a thread | Done | Same method with `false`; http.ts:113 `DELETE /messages/:id/follow`; contract api-contract.md:180 | | 2 | — |
| 8-13 | 8 | REST: `PUT /messages/:id/reactions/:emoji` | Different from spec | One toggle: `POST /messages/:id/reactions { emoji }` (http.ts:115; `Api.chat.react` types.ts:403; mock chat.ts:477; contract api-contract.md:120) | A toggle is not idempotent: a retried POST after a lost response flips the reaction back. The spec's PUT is a set | 2 | S |
| 8-14 | 8 | REST: `DELETE /messages/:id/reactions/:emoji` | Different from spec | No DELETE route; removal is the same toggle POST (http.ts:115) | As 8-13: removing needs its own idempotent route | 2 | S |
| 8-15 | 8 | REST: `POST /channels/:id/read {seq}` | Done | `Api.chat.markRead`; mock chat.ts:695 (forward only); http.ts:102; contract api-contract.md:36,43; event `readChanged` chat.ts:704 | | 1 | — |
| 8-16 | 8 | REST: `POST /messages/:id/unread` | Done | Equivalent, scoped by channel: `POST /channels/:id/unread { seq }` (`Api.chat.markUnread`; mock chat.ts:706; http.ts:103; contract api-contract.md:37,45); event `readChanged` chat.ts:715 | | 1 | — |
| 8-17 | 8 | REST: pins | Not started (later phase) | No `Api` method, route or mock | | 3 | M |
| 8-18 | 8 | REST: saved items | Not started (later phase) | No `Api` method, route or mock | | 3 | M |
| 8-19 | 8 | REST: reminders | Not started (later phase) | No `Api` method, route or mock | | 3 | M |
| 8-20 | 8 | REST: drafts (`PUT /drafts`, keyed) | Done | Equivalent: `PUT /channels/:id/draft { body, rootId }` + `GET /workspaces/:id/drafts` (`Api.chat.saveDraft`/`drafts`; mock chat.ts:640,648; http.ts:96-97; contract api-contract.md:142-145); event `draftChanged` chat.ts:666 | | 1 | — |
| 8-21 | 8 | REST: scheduled messages CRUD | Not started (later phase) | No `Api` method, route or mock | | 3 | M |
| 8-22 | 8 | REST: scheduled messages `send-now` | Not started (later phase) | No `Api` method, route or mock | | 3 | S |
| 8-23 | 8 | REST: `POST /files/upload-url` | Done | Step 1 inside `Api.files.uploadForChat` (types.ts:518; http.ts:227-231); mock files.ts:200-224; contract api-contract.md:350 | | 2 | — |
| 8-24 | 8 | REST: `POST /files/:id/complete` | Done | Step 3 of `uploadForChat` (http.ts:232); mock marks it clean (no scanner) files.ts:213-222; contract api-contract.md:352 | | 2 | — |
| 8-25 | 8 | REST: `GET /files/:id` | Done | `Api.files.url` (http.ts:218; mock files.ts:128-147, 404 when unseen, 400 blocked or pending); contract api-contract.md:355 | | 2 | — |
| 8-26 | 8 | REST: `PATCH /files/:id` | Done | `Api.files.update`; mock files.ts:231 (uploader or Admin, 403); http.ts `PATCH /api/files/:id`; contract api-contract.md:357; events `fileChanged` + `messageChanged` files.ts:244-245 | | 2 | — |
| 8-27 | 8 | REST: `DELETE /files/:id` | Done | `Api.files.delete`; mock files.ts:248; contract api-contract.md:358; events files.ts:259-261 | | 2 | — |
| 8-28 | 8 | REST: `POST /files/:id/share` | Done | `Api.files.share`; mock files.ts:263; contract api-contract.md:359; events `messageReceived` + `fileChanged` files.ts:277-278 | | 2 | — |
| 8-29 | 8 | REST: channels create | Partial | `Api.chat.createChannel` / `openDm`; mock chat.ts:349, 326; http.ts:119-120 (`POST /workspaces/:id/channels`, `/dms`) | api-contract.md has no table for create or DM (rules: unique name, privacy, 2 to 9 people, `NewChannel`); only the code defines them | 1 | S |
| 8-30 | 8 | REST: channels read | Done | `channels`, `channel`; mock chat.ts:609,615; http.ts:90-91; earlier spec ...shell-data-layer-design.md:207-208 | | 1 | — |
| 8-31 | 8 | REST: channels update | Done | `Api.chat.updateChannel`; mock chat.ts:365; http.ts:121; contract api-contract.md:273,280,313 | | 2 | — |
| 8-32 | 8 | REST: channels delete | Different from spec | No delete. Archive and restore instead: `POST /channels/:id/archive` and `/restore` (`Api.chat.archiveChannel`/`restoreChannel`; mock chat.ts:475-476; http.ts:122-123) | No hard delete route; archive and restore aren't specified in api-contract.md (only "existing channel routes", line 62). The spec's §11 audit log would cover delete and archive | 2 | S |
| 8-33 | 8 | REST: channel members, add | Done | `Api.chat.addMembers`; mock chat.ts:400; http.ts:126; contract api-contract.md:274,281,310 | | 2 | — |
| 8-34 | 8 | REST: channel members, remove | Done | `Api.chat.removeMember`; mock chat.ts:462; http.ts:129; contract api-contract.md:275,282 | | 2 | — |
| 8-35 | 8 | REST: channel join | Partial | `Api.chat.join`; mock chat.ts:398 (`setMember`); http.ts:124 | Route and rules (public only, not archived, not a project's channel, posts a "joined" system message) are not in api-contract.md | 1 | S |
| 8-36 | 8 | REST: channel leave | Partial | `Api.chat.leave`; mock chat.ts:399; http.ts:125 | Same: only mentioned as "existing channel routes" (api-contract.md:62) | 1 | S |
| 8-37 | 8 | REST: invite members | Done | `addMembers(id, userIds)` as 8-33; rules api-contract.md:281 | | 2 | — |
| 8-38 | 8 | REST: invite emails | Done | `addMembers(id, userIds, emails)`, `GET /channels/:id/invitations`, `DELETE /invitations/:id` (mock chat.ts:400-460; http.ts:126-128; contract api-contract.md:306-325); event `channelChanged` chat.ts:434,460 | | 2 | — |
| 8-39 | 8 | REST: per-channel notification prefs | Done | `PATCH /channels/:id/me { notifyLevel }` (`setNotifyLevel`; mock chat.ts:719; http.ts:114; contract api-contract.md:26,208-215); event `readChanged` chat.ts:322 | | 2 | — |
| 8-40 | 8 | REST: global notification prefs (keywords, DND, digest) | Not started (later phase) | None; slice 3 ruling defers to Preferences (todo.md slice 3) [phase inferred] | | 3 | M |
| 8-41 | 8 | REST: star | Done | `setStarred`; mock chat.ts:717; http.ts:130 `PATCH /channels/:id/me { starred }`; contract api-contract.md:38 | | 1 | — |
| 8-42 | 8 | REST: mute | Done | `setMuted`; mock chat.ts:718; http.ts:131; contract api-contract.md:38 | | 1 | — |
| 8-43 | 8 | REST: sidebar order | Not started (later phase) | None (see 7-15) | | 3 | S |
| 8-44 | 8 | REST: `GET /search?q=&type=&from=&in=&before=&after=&has=&is=thread` | Not started (later phase) | No `Api.search`; the top-bar search is a client-side page and people filter (src/layout/GlobalSearch.tsx) | | 3 | L |
| 8-45 | 8 | REST: `GET /tasks/resolve?keys=` (status, title, project, assignee, permission-filtered) | Partial | `Api.tickets.resolve`; mock src/mocks/tickets.ts:53-68; http.ts:138; contract api-contract.md:99; refreshed on `ticketUpdated` (queryKeys.ts:62-66) | Returns every task that exists; no per-viewer filter (see 9-05) | 1 | S |
| 8-46 | 8 | REST: `POST /tasks/from-message` | Done | Equivalent: `POST /projects/:id/tasks` with `linkedChannelId` / `linkedMessageId` (`Api.tasks.create`; mock src/mocks/tickets.ts:143,224-225; http.ts `tasks.create`; UI src/pages/chat/useTaskFromMessage.tsx); described in docs/superpowers/specs/2026-10-26-spark-flow-company-system-design.md, not in api-contract.md | | 2 | — |
| 8-47 | 8 | REST: `POST /commands/:name` | Not started (later phase) | None | | 3 | M |
| 8-48 | 8 | WS server→client: `message.created` | Partial | Mock `messageReceived`: chat.ts:578,291,394,433,471; src/mocks/files.ts:277; handler `onMessageReceived` realtime.ts:13; bridge RealtimeBridge.tsx:18; keys queryKeys.ts:54; contract api-contract.md:54 | Transport: unconnected client (see top). No `seq` gap check in the client: every event just invalidates and refetches the channel (queryKeys.ts:54-57), which makes gaps harmless but isn't the contract's described check (api-contract.md:54) | 1 | S |
| 8-49 | 8 | WS server→client: `message.updated` | Partial | Mock `messageChanged` (edit chat.ts:516, restore, follow chat.ts:607, file edits files.ts:245); `onMessageChanged`; keys queryKeys.ts:71; contract api-contract.md:55 | Transport. Payload is `{ channelId, messageId }` only, not the updated message | 1 | S |
| 8-50 | 8 | WS server→client: `message.deleted` | Partial | Same `messageChanged` as an edit (chat.ts:546); contract api-contract.md:55 | Transport. No separate event name or payload: a client can't tell a delete from an edit without refetching | 1 | S |
| 8-51 | 8 | WS server→client: `reaction.added` | Partial | Mock `messageChanged` via `changed()` chat.ts:313,490; keys queryKeys.ts:71 | Transport. No reaction event name; the contract names no event for reactions (api-contract.md:120 only describes the route) | 2 | S |
| 8-52 | 8 | WS server→client: `reaction.removed` | Partial | Same as 8-51 (the toggle publishes one `messageChanged`) | Transport. Add and remove are not distinguishable; not in the contract | 2 | S |
| 8-53 | 8 | WS server→client: `thread.updated` (reply_count, last_reply_at, reply_user_ids) | Partial | Mock `replyReceived` chat.ts:593 and `messageChanged` for follow (chat.ts:607); keys queryKeys.ts:58-61 refetch the message, its replies and the channel page; contract api-contract.md:186,200 maps `thread.updated` to these | Transport. No dedicated event or payload with the three summary fields | 2 | S |
| 8-54 | 8 | WS server→client: `typing.started` | Partial | `sendTyping` publishes `userTyping` (src/mocks/realtime.ts:68); handler `onUserTyping`; `RealtimeBridge.tsx:33` → `addTyper` (src/lib/uiStore.ts:109); line under the composer src/pages/chat/ChannelTyping.tsx | Transport. Not documented in api-contract.md | 1 | S |
| 8-55 | 8 | WS server→client: `typing.stopped` | Partial | No stop event: a typer disappears after `TYPING_MS` = 3 s (uiStore.ts:8,109-115) | Transport. No explicit stop on send or clear; the line lingers up to 3 s after the message arrives | 1 | S |
| 8-56 | 8 | WS server→client: `presence.changed` | Missing | `User.presence` is a static seed value (types.ts:7; src/mocks/seed.ts); no event type in `RealtimeEvent` (realtime.ts:45-62), no handler, no `keysForEvent` case | Presence dots never change; nothing publishes or consumes it | 1 | M |
| 8-57 | 8 | WS server→client: `channel.updated` | Partial | Mock `channelChanged` (create, update, archive, join, leave, invite, revoke: chat.ts:292,310,346,362,395,434,460,472); `onChannelChanged`; keys queryKeys.ts:76-79; contract api-contract.md:284,323 | Transport | 1 | S |
| 8-58 | 8 | WS server→client: `member.joined` | Partial | Mock `channelChanged` plus a `messageReceived` "joined"/"added" system message (chat.ts:288-292,431-434); contract api-contract.md:255 lists the name | Transport. No separate event or payload naming who joined | 2 | S |
| 8-59 | 8 | WS server→client: `member.left` | Partial | Mock `channelChanged` plus a "left"/"removed" system message (chat.ts:471-472) | Transport. Same as 8-58 | 2 | S |
| 8-60 | 8 | WS server→client: `read.marker_updated` | Partial | Mock `readChanged` `{ userId, channelId?, seq? }` (chat.ts:322,704,715; mentions.ts:81; activityFeed.ts:66); `onReadChanged`; keys queryKeys.ts:92; contract api-contract.md:56 | Transport. The contract says it goes only to that user's connections; the mock hub broadcasts to every tab (clients ignore `userId`) | 1 | S |
| 8-61 | 8 | WS server→client: `file.shared` | Partial | Mock `fileChanged` + `messageReceived` (files.ts:277-278); `onFileChanged`; keys queryKeys.ts:87; contract api-contract.md:370 | Transport. `file.updated` is in the contract but not in the spec's list; all three file events share one `{ fileId }` event | 2 | S |
| 8-62 | 8 | WS server→client: `file.deleted` | Partial | Mock `fileChanged` + `messageChanged` + `filesChanged` (files.ts:259-261); contract api-contract.md:370 | Transport | 2 | S |
| 8-63 | 8 | WS server→client: `notification.created` | Partial | Mock `notificationCreated { userId }` (chat.ts:491,580,594; files.ts:279); `onNotificationCreated`; keys queryKeys.ts:94; contract api-contract.md:249-255 | Transport | 2 | S |
| 8-64 | 8 | WS server→client: `draft.updated` | Partial | Mock `draftChanged` (chat.ts:666); `onDraftChanged`; keys queryKeys.ts:90; contract api-contract.md:145 | Transport | 1 | S |
| 8-65 | 8 | WS server→client: `scheduled.sent` | Not started (later phase) | No event type | | 3 | S |
| 8-66 | 8 | WS server→client: `reminder.fired` | Not started (later phase) | No event type | | 3 | S |
| 8-67 | 8 | WS server→client: `call.started` (P2) | Not started (later phase) | No event type | | 4 | M |
| 8-68 | 8 | WS server→client: `call.updated` (P2) | Not started (later phase) | No event type | | 4 | S |
| 8-69 | 8 | WS server→client: `call.ended` (P2) | Not started (later phase) | No event type | | 4 | S |
| 8-70 | 8 | WS client→server: `typing` | Partial | `RealtimeClient.sendTyping` (realtime.ts:12), called every 2 s while typing (`TYPING_EVERY_MS`, RichComposer.tsx:39,233; ChannelPage.tsx:155); mock publishes it | Transport: backend client's `sendTyping` is a no-op (realtime.ts:77). Frame not documented in api-contract.md | 1 | S |
| 8-71 | 8 | WS client→server: `presence.ping` | Missing | No method on `RealtimeClient` | Nothing tells the server I'm active (needed for `@here`, presence dots) | 1 | M |
| 8-72 | 8 | WS client→server: `ack` | Missing | No method on `RealtimeClient` | No delivery acknowledgement from the client | 1 | M |
| 8-73 | 8 | WS client→server: `mark_read` | Different from spec | Done over REST only: `POST /channels/:id/read` (8-15) | No socket frame; the REST call covers the need | 1 | S |
| 8-74 | 8 | WS client→server: `subscribe` | Partial | Equivalent: `joinChannel` (realtime.ts:9), called when a channel opens (ChannelPage.tsx:360; ChannelFeed.tsx:49) | Mock hub has no groups (mock realtime.ts:66 no-op); backend client no-op (realtime.ts:75); not in the contract | 1 | S |
| 8-75 | 8 | WS client→server: `unsubscribe` | Partial | Equivalent: `leaveChannel` (realtime.ts:10; ChannelPage.tsx:361) | Same as 8-74 | 1 | S |
| 8-76 | 8 | Transport: authenticate the socket | Missing | `createUnconnectedClient().start()` only warns once (realtime.ts:66-73); REST sends cookies (`credentials: 'include'`, http.ts:28) | No socket auth; not in the contract | 1 | M |
| 8-77 | 8 | Transport: on reconnect send a resume token, replay missed events by `seq` | Partial | Contract states the expectation (api-contract.md:58). In the app, TanStack Query's default refetch on network reconnect and window focus (main.tsx:16, default `refetchOnReconnect`) catches data up | No resume token, no replay, no reconnect handler on `RealtimeClient`; the refetch is a stand-in | 1 | L |
| 8-78 | 8 | Transport: writes are idempotent (client id) | Partial | Send is idempotent by `(sender, clientId)` (chat.ts:571-572; contract api-contract.md:42,285); edit with no change is a no-op (chat.ts:505) | Replies have no client id (8-10); reactions are a toggle (8-13); a second delete answers 400 (chat.ts:248 `checkPlain`); uploads, share and channel writes have no key | 1 | M |
| 8-79 | 8 | Transport: ordering is per channel, by `seq` | Done | `seq` assigned in the write transaction (chat.ts:745); pages sorted by `seq` (chat.ts:35,635); the list, read marker and jump all key on `seq` (src/pages/chat/MessageList.tsx:122,140,206); contract api-contract.md:15,66 | | 1 | — |
| 8-80 | 8 | Transport: typing and presence are ephemeral | Partial | Typing is never stored: `partialize` drops `typing` (uiStore.ts:121) and the hub only relays it (mock realtime.ts:68) | Presence is a stored static field with no live path (8-56) | 1 | S |
| 8-81 | 8 | Backend socket client (SignalR) behind `RealtimeClient` | Missing | `createRealtimeClient` returns `createUnconnectedClient()` when `backendOn` (realtime.ts:98-100); it logs "Real-time over SignalR isn't connected yet." once | With the backend on no event arrives and typing is not sent. One shared piece closes the Transport gap in 8-48 to 8-64 and 8-70, 8-74, 8-75. Needs the backend hub and the auth in 8-76 | 1 | L |

#### §9 Permissions

| ID | Section | Requirement | Status | Evidence | Gap | Phase | Effort |
|---|---|---|---|---|---|---|---|
| 9-01 | 9 | Authorize every read (channels, messages, replies, drafts, read state) | Done | Mock `readableChannel` (chat.ts:129-133, 403 for a private channel I'm not in) guards channel, messages, before/after/first, message, replies, drafts, read, unread, star, mute, follow; list filtered by `visible` (chat.ts:126,613); tests chat.test.ts:473-485 | `can()` has no read action; the mock has no workspace membership, so a public channel in another workspace is readable by id (backend must refuse) | 1 | — |
| 9-02 | 9 | Authorize every write (send, reply, react, edit, delete, restore) | Done | `checkCanPost` / `checkCanWrite` chat.ts:197-213 (project channel follows `collab.post`; private needs membership; archived refused; Only admins via `channel.post`); used by send, reply, react, edit, remove, restore (chat.ts:482,497,523,552,573,586); UI hides the composer (`useCanWrite` src/pages/chat/useCanPost.ts:27) | | 1 | — |
| 9-03 | 9 | Authorize files | Done | `visibleFile` 404s for anyone who can't see it (files.ts:76-83); `requireFileManage` 403 (files.ts:86); `url()` checks places (files.ts:128-147); send needs my own clean file (chat.ts:180-191); tests chatFiles.test.ts:46,72,117-155 | | 2 | — |
| 9-04 | 9 | Authorize search | Not started (later phase) | No search API (8-44) | | 3 | M |
| 9-05 | 9 | Authorize task resolution | Partial | UI falls back to the plain key when a task isn't returned (src/pages/chat/MessageBody.tsx:135-137); contract says "tasks the person may see" (api-contract.md:99) | Mock `tickets.resolve` returns every existing task to any caller (src/mocks/tickets.ts:53-68); there is no task-view rule in `can()` | 1 | S |
| 9-06 | 9 | Authorize unfurls | Partial | Link previews are an allow-list of domains and the server fetches without cookies (`linkPreviewFor` src/mocks/linkPreviews.ts:15-23; contract api-contract.md:113-116); task unfurl follows 9-05 | The mock has no authorization step on `linkPreview`; contract doesn't say the route needs a session | 1 | S |
| 9-07 | 9 | Role: Owner | Different from spec (approved: CLAUDE.md "roles are admin, sales, pm, member"; same vocabulary as Spark CRM) | `roles` = admin, sales, pm, member (src/lib/roles.ts:2) | No Owner role; Admin is the top role | 2 | S |
| 9-08 | 9 | Role: Admin | Done | `role === 'admin'` passes `can()` (permissions.ts:52); labels roles.ts:6 | | 1 | — |
| 9-09 | 9 | Role: Member | Done | `member` in `roles` (roles.ts:2); defaults in `can()` switch (permissions.ts:54-101) | | 1 | — |
| 9-10 | 9 | Role: Guest, single-channel | Partial | Email invites create a pending `role: 'guest'` invitation to one channel (types.ts:155-162; chat.ts:428); Guest tag on invitation rows (ChannelMembers.tsx:192) | No guest user account, no accept flow, no role in `Role`, no enforcement that a guest sees only that channel. Own slice planned (todo.md slice 5; contract api-contract.md:325) | 2 | L |
| 9-11 | 9 | Role: Guest, multi-channel | Missing | Each invitation is for one channel; nothing groups them | No multi-channel guest | 2 | M |
| 9-12 | 9 | Channel setting: who can post | Done | `whoCanPost` (types.ts:144); `can('channel.post')` permissions.ts:72, `channel.restrictPosting` (Admins) permissions.ts:61; mock 403 "Only admins can post in #x." chat.ts:207-213 and 378-380; UI shows the line instead of the composer (useCanPost.ts:27; Settings tab); tests channelDetails.test.ts:47,112,143 | | 2 | — |
| 9-13 | 9 | Channel setting: who can @channel | Missing | No setting, no `@channel` / `@here` (see 7-49, 7-50) | | 2 | M |
| 9-14 | 9 | Channel setting: who can invite | Partial | Rules are fixed, not a setting: members and Admins add people (`channel.manage` permissions.ts:51); email invites Admin-only (`channel.inviteByEmail` permissions.ts:63; mock 403 chat.ts:412-414); UI hides by `usePermission` (ChannelPage.tsx:208-210) | No per-channel "who can invite" choice | 2 | S |
| 9-15 | 9 | Edit: author only | Partial | Mock 403 "You can only change your own messages." (chat.ts:498); UI hides Edit unless own (src/pages/chat/messageRights.ts:11-12 `edit: own`, used ChannelMessage.tsx:135); tests chat.test.ts:360,941 | Rule is not in `can()` (no `message.edit` action): it lives in `messageRights.ts` and inline in the mock, against CLAUDE.md "`can()` is the one rule table" | 1 | S |
| 9-16 | 9 | Edit: within the admin edit window (default: no limit) | OPEN | Not built: no window setting, no time check in `edit` (chat.ts:493). Blocked on item 8 "Edit window default and message retention policy" | | 1 | M |
| 9-17 | 9 | Delete: author or admin | Partial | Mock 403 for anyone else (chat.ts:525); UI `remove: own \|\| (admin && !card)` (messageRights.ts:12; admin read from the user's role, ChannelMessage.tsx:134); tests chat.test.ts:361,939; contract api-contract.md:161 | Not in `can()` (no `message.delete`); duplicated in `messageRights.ts` and the mock | 1 | S |
| 9-18 | 9 | Delete file: uploader or admin | Done | `can('file.manage')` permissions.ts:69-70; mock 403 `requireFileManage` files.ts:86-91, used by delete files.ts:252; UI `mayManage` FileActions.tsx:59; tests permissions.test.ts:155-157, chatFiles.test.ts:125 | | 2 | — |
| 9-19 | 9 | Turn on GIFs: admin | Not started (later phase) | No setting, no `can()` action; GIF picker provider is OPEN item 6 | | 3 | M |
| 9-20 | 9 | Private channel content never in search for non-members | Not started (later phase) | No search (8-44); the rule must be part of it | | 3 | M |
| 9-21 | 9 | Private channel content never in Activity for non-members | Done | `reaches`/`mentionsFor` reach only members of a private channel (src/mocks/mentions.ts:21-22,36-75); `activityFor` drops items where `!canRead` and re-reads text now (src/mocks/activityFeed.ts:20-45); tests mentions.test.ts, notifications.test.ts | | 2 | — |
| 9-22 | 9 | Private channel content never in unfurls for non-members | Done | An unfurl is built from the URL and an allow-listed domain only (linkPreviews.ts:15-23); the server fetch carries no credentials (contract api-contract.md:114); no message text feeds an unfurl | Revisit when Apps' "unfurls by domain" arrives (Phase 4) | 2 | — |
| 9-23 | 9 | Task chips show status only when the viewer can see the task, else plain text | Partial | UI: a chip only when `ctx.tasks.get(key)` has it, else the plain key (MessageBody.tsx:135-137) | The server side doesn't filter (see 9-05), so the plain-text fallback never triggers for an existing task | 1 | S |

#### Notes

- **One shared gap behind every server→client row**: `src/lib/realtime.ts:66-96` returns a no-op client when `backendOn`. The prototype path is complete (mock hub → `RealtimeClient` → `RealtimeBridge.tsx` → `keysForEvent` in `src/api/queryKeys.ts:52-103`, with tests in `src/mocks/realtime.test.ts`). Building the SignalR client plus socket auth, resume and ack is one piece of work (8-76, 8-77, 8-81); the per-event rows then only need the backend to send them.
- **Event names**: the client uses its own handler names (`messageReceived`, `messageChanged`, `channelChanged`, `readChanged`, `fileChanged`, `notificationCreated`, `draftChanged`, `userTyping`, `replyReceived`); api-contract.md:50-58 and 249-255 map them to spec names for `message.created/updated/deleted`, `read.marker_updated`, `notification.created`, `channel.updated`, `member.joined/left`, `file.*`, `draft.updated`. Not mapped in the contract: reactions, `thread.updated` (only inline at lines 186, 200), typing, presence, and every client→server frame (`typing`, `presence.ping`, `ack`, `subscribe`, `unsubscribe`).
- **Contract gaps (routes in `src/lib/http.ts` that api-contract.md does not specify)**: `POST /workspaces/:id/channels`, `POST /workspaces/:id/dms`, `POST /channels/:id/join`, `/leave`, `/archive`, `/restore`. `GET /channels/:id`, `GET /workspaces/:id/channels`, `GET /messages/:id`, `GET /messages/:id/replies` live in the earlier docs/superpowers/specs/2026-10-26-spark-flow-shell-data-layer-design.md:206-210, and task create with `linkedMessageId` in the company-system spec.
- **`can()` is not the only rule table for chat**: message edit and delete rights are in `src/pages/chat/messageRights.ts` and inline in `src/mocks/chat.ts:498,525`; `useCanPost` (src/pages/chat/useCanPost.ts:11-22) repeats the mock's private-channel membership rule instead of calling `can()`. CLAUDE.md says `can()` is the one table, so add `message.edit`, `message.delete` and a channel-read action and call them from both sides (9-15, 9-17).
- **No workspace membership in the prototype**: `readableChannel` / `visible` (chat.ts:126-133) check privacy and membership only, so any signed-in person can read a public channel of another workspace by id. The backend has to enforce workspace scope (not gradable here).
- **Idempotency is uneven** (8-78): only send is keyed. Reply (no client id), reaction (toggle), delete (a repeat answers 400), upload and share are not safe to retry blindly. The send queue (src/lib/sendQueue.ts) retries sends only.
- **Extra data beyond the spec's table**: `StoredNotification` (reaction and thread Activity items, db.ts:39), `trash` for Undo, `Attachment.deletedAt`, `ThreadReply` as its own collection, `Invitation.workspaceId`. api-contract.md:244 cites "spec §7 `Notification`", but §7 has no Notification row; if the entity is wanted, the spec's table should list it.
- **Retention**: deleted content is wiped from the row and kept in `trash` for the 10 s Undo window; `trash` is only pruned the next time someone deletes (chat.ts:529), so content can sit longer than the window. Retention policy is OPEN item 8.
- **Mention naming**: `@all` is the project's syntax (CLAUDE.md) while the spec says `@channel` and `@here`; both `@here` and the user-group mention are missing, and the "confirm before more than 25 members" prompt and the "who can @channel" setting depend on them (7-49, 7-50, 7-51, 9-13).
- **Rulings applied**: Invitation role is guest-only (slice 5), channel project link is read-only (slice 4), roles follow CLAUDE.md (admin, sales, pm, member), and the keywords, DND and email digest wait for Preferences (slice 3).

### Audit G: Section 10 (Accessibility and keyboard), Section 11 (Non-functional targets), Section 12 acceptance criteria (Phases 0-4), plus Test inventory

Repo: `/Users/ezzelden/Work/ezz/WORK/Spark/DEV/Spark_Flow/spark-flow-web`. Spec: `docs/flow-chat/FLOW_CHAT_REDESIGN.md` lines 617-706. Code read-only; one full `npx vitest run` was done (see Test inventory). `[app check]` marks items that can only be fully judged in the running app.

Evidence abbreviations: `a11y.bt` = `src/pages/chat/a11y.browser.test.tsx`; `layers.t` = `src/components/sf/layers.test.tsx`; `ckeys.t` = `src/pages/chat/useChannelKeys.test.tsx`; `CM.t` = `src/pages/chat/ChannelMessage.test.tsx`; `RC.bt` = `src/pages/chat/composer/RichComposer.browser.test.tsx`; `rows.t` = `src/pages/chat/messageRows.test.ts`; `todo` = `tasks/todo.md`.

| ID | Section | Requirement | Status | Evidence | Gap | Phase | Effort |
|---|---|---|---|---|---|---|---|
| 10-01 | 10 A11y | Every icon-only button has an accessible name | Done | `src/components/sf/Button.tsx:64` (`label` is a required prop of `IconButton`), `:96` (`aria-label={label}`); test `primitives.test.tsx` "requires a label at the type level". The raw icon-only buttons are named too: `composer/RichComposer.tsx:402` (Send), `uploads/UploadTray.tsx:66` (Remove file), `layout/InspectorFrame.tsx:42` (Close). axe runs over every chat surface in light and dark (`a11y.bt:177-185`) | | 0 | — |
| 10-02 | 10 A11y | Every icon-only button has a tooltip | Partial | `IconButton` wraps itself in `Tooltip` by default (`Button.tsx:87,112`; test `primitives.test.tsx` "shows after the hover delay, at once on keyboard focus, and hides on Escape") | Icon-only buttons with a name but no tooltip: raw `<button>`s for Send (`RichComposer.tsx:400`), tray × (`UploadTray.tsx:64`), panel Close (`InspectorFrame.tsx:42`); `tooltip={false}` on Modal × (`Modal.tsx:89`), search Clear (`GlobalSearch.tsx:261`), chip × (`TokenInput.tsx:112`), Toast Dismiss (`Toast.tsx:88`), top-bar Open menu (`TopBar.tsx:26`), drawer Close (`MobileNav.tsx:89`). No test asserts "every icon-only button has a tooltip" | 0 | S |
| 10-03 | 10 A11y | Semantic element `button` for controls | Done | grep of `src/pages/chat`, `src/layout`, `src/components/sf` finds no `div`/`span`/`li` with `onClick`; controls are `button`/`IconButton`/`Link`. axe in `a11y.bt` | | 0 | — |
| 10-04 | 10 A11y | Semantic element `input` for fields | Done | native `<input>`: Checkbox (`Toggle.tsx:64`, test `primitives.test.tsx` "a checkbox is a native input named by its label"), TokenInput field (`TokenInput.tsx:130`), top-bar search (`GlobalSearch.tsx:234`); composer is a Lexical `textbox` named by its placeholder (`RichComposer.tsx:298`) | | 0 | — |
| 10-05 | 10 A11y | `role="log"` for the message list | Done | `src/pages/chat/MessageList.tsx:351` (`role="log"`, `aria-label="Messages in …"`, focusable); test `MessageList.browser.test.tsx:145` | See Notes 3: `aria-live="off"` plus a separate polite announcer, where 6.2 says `aria-live="polite"` | 1 | — |
| 10-06 | 10 A11y | `role="menu"` | Done | `src/components/sf/Menu.tsx:214`; `layers.t:35-170` | | 0 | — |
| 10-07 | 10 A11y | `role="menuitem"` | Done | `Menu.tsx:274` (plain item), `:327` (submenu row); `layers.t:36` (arrows, wrap) | | 0 | — |
| 10-08 | 10 A11y | `role="menuitemradio"` | Done | `Menu.tsx:274` (any `MenuItem` with `checked`); used by the notify-level menu `pages/chat/NotifyLevelMenu.tsx:33`; test `a11y.bt:193-197` finds `menuitemradio` "Mentions and keywords" | | 0 | — |
| 10-09 | 10 A11y | `role="dialog"` with `aria-modal` | Done | `src/components/sf/Modal.tsx:61-62`; drawer `layout/MobileNav.tsx:83`; test `layers.t:174` "is a named modal dialog that focuses its first field and traps Tab" | | 0 | — |
| 10-10 | 10 A11y | `role="switch"` | Done | `src/components/sf/Toggle.tsx:23`; test `primitives.test.tsx` "a toggle is a switch that flips aria-checked" | | 0 | — |
| 10-11 | 10 A11y | `role="listbox"` with `aria-activedescendant` for autocomplete | Done | Composer @ and #: `composer/AutocompletePlugin.tsx:118-134` (named listbox container, `role="option"`, `aria-selected`; Lexical's typeahead plugin sets `aria-activedescendant`/`aria-controls` on the editor), tests `a11y.bt:329` (listbox "Mention someone") and `a11y.bt:348` (`aria-autocomplete="list"`); TokenInput `TokenInput.tsx:130,147`, test `layers.t:263`; top-bar search `GlobalSearch.tsx:109,241` | `aria-activedescendant` on the Lexical editor is Lexical's own and has no test of its own [app check] | 1 | — |
| 10-12 | 10 A11y | Menus trap focus | Done | `Menu.tsx:178-179` (Tab/Shift+Tab move through the items and wrap); test `layers.t:145` "keeps Tab inside and closes on a press outside" | | 0 | — |
| 10-13 | 10 A11y | Menus restore focus | Done | `Menu.tsx:65-68` (`closeAll` focuses the trigger); test `layers.t:107` (Escape returns to the trigger), `layers.t:133` | | 0 | — |
| 10-14 | 10 A11y | Modals trap focus | Done | `Modal.tsx:67` (`trapTab`), `layers.tsx:61-80`; test `layers.t:174`; Popover too `Popover.tsx:101`, `layers.t:320` | | 0 | — |
| 10-15 | 10 A11y | Modals restore focus | Partial (was Done) | `Modal.tsx:38` (`useRestoreFocus`), `layers.tsx:42-53`; tests `layers.t:186`, `layers.t:377` (fallback when the opener is gone) | [app: after Delete message focus lands on body, because the row that opened the menu is gone] | 0 | — |
| 10-16 | 10 A11y | Esc closes the top-most layer | Done | `layers.tsx:15-36` (layer stack, only the top layer takes Escape, a prevented key is left alone); tests `layers.t:123,351`, `ckeys.t:105-170` (menu, panel, dialog each take Esc first) | | 0 | — |
| 10-17 | 10 A11y | Every text and control pair meets the 3.2 contrast | Done | `src/styles/flowTokens.test.ts` (4.5:1 text pairs and 3:1 borders, light and dark, token values equal the design file); axe contrast in light and dark on every chat surface `a11y.bt:177-185`; todo notes fixes made when axe caught pairs (e.g. todo line 529) | | 0 | — |
| 10-18 | 10 A11y | …verified with an automated check in CI | Partial | The checks exist and run in `npm test` (`package.json` script `test`: `vitest run`, browser project included) | No CI pipeline in the repo: no `.github`, `.gitlab-ci`, `amplify.yml` or similar tracked (`git ls-files` finds none). The check is automated but runs only when someone runs it | 0 | S |
| 10-19 | 10 Shortcuts | ⌘/Ctrl+K: Search | Partial | Handler `src/layout/GlobalSearch.tsx:213-220` (⌘K or Ctrl+K focuses the top-bar search box; also `/`); hint `aria-keyshortcuts` `:243` and Kbd chip; no test presses it (only `primitives.test.tsx` checks `aria-keyshortcuts` on an IconButton) | [app: confirmed. ⌘K in the composer opens the link row and global search together; focus ends on body; screenshot 15] In the composer, ⌘K is also "Link" (`composer/KeysPlugin.tsx:75-78`, spec 6.8) and `GlobalSearch.tsx:213` has no `defaultPrevented` or composer guard, so both seem to run (link field opens, search steals focus). The target is the quick-find box, the Search results view is Phase 3 | 0 | S |
| 10-20 | 10 Shortcuts | ⌘/Ctrl+Shift+T: Threads | Not started (later phase) | No handler; Threads view is Phase 3. Sidebar link exists only behind `chatRedesign` (`layout/Sidebar.tsx:307`) and no `/threads` route exists (`src/router.tsx`) | Whole Threads view | 3 | L |
| 10-21 | 10 Shortcuts | ⌘/Ctrl+Shift+A: Activity | Missing | No handler anywhere (grep for `shiftKey`/`key ===`). The Activity view itself is built: route `src/router.tsx:73`, `pages/chat/ActivityPage.tsx` | Add a global key (e.g. in `AppLayout`) that navigates to `paths.activity(slug)`; add a hint | 2 | S |
| 10-22 | 10 Shortcuts | ⌘/Ctrl+F: Search in channel | Not started (later phase) | No handler; `ChannelHeader.tsx:51` says channel search comes later; no search view | Search view with `in:#channel` scope | 3 | L |
| 10-23 | 10 Shortcuts | Alt+↑: previous channel | Done | `pages/chat/channelKeys.ts:27-35`, `useChannelKeys.ts:34-43`, wired in `ChannelShortcuts.tsx:25-29`; test `ckeys.t:44` "opens the next or previous channel in the sidebar" (key events dispatched on window), `ckeys.t:60` (stops at the ends, no wrap = ruling todo:305) | | 1 | — |
| 10-24 | 10 Shortcuts | Alt+↓: next channel | Done | same handler; test `ckeys.t:44`; `channelKeys.test.ts:49` | | 1 | — |
| 10-25 | 10 Shortcuts | Alt+Shift+↑: previous unread channel | Done | `channelKeys.ts:20-24` (`stepChannel` unread-only skips read and muted rows); test `ckeys.t:52`, `channelKeys.test.ts:32` | Muted channels are skipped (approved ruling todo:305) | 1 | — |
| 10-26 | 10 Shortcuts | Alt+Shift+↓: next unread channel | Done | same; test `ckeys.t:52` | | 1 | — |
| 10-27 | 10 Shortcuts | Esc (no menu, popover or modal open): mark channel read | Done | `channelKeys.ts:33`, `useChannelKeys.ts:36` (skips a prevented key, an open `aria-modal` dialog, IME, typing in another field), `ChannelShortcuts.tsx:29` → `markOpenChannelRead` (`pages/chat/readState.ts`); tests `ckeys.t:81,88,105-170`, `readState.test.tsx:110-130` | Does nothing when nothing is unread (ruling todo:305) | 1 | — |
| 10-28 | 10 Shortcuts | Shift+Esc: mark all read | Different from spec (approved ruling: asks first) | `channelKeys.ts:33`; `ChannelShortcuts.tsx:30-35,39-` (`MarkAllReadModal`: "Mark everything read?" with the count, then marks each); tests `ckeys.t:96`, `ChannelShortcuts.test.tsx:31-87` | Spec says Shift+Esc marks all read; implementation opens a confirm modal first (ruling todo:305, "the read marker only moves back one channel at a time") | 1 | — |
| 10-29 | 10 Shortcuts | Up: edit last message | Done | `composer/KeysPlugin.tsx:100-108` (Up in an empty box, no modifier), `pages/chat/ChannelPage.tsx:161-165` → `lastEditable` (`messageRights.ts:19`) → `useEditing.start`; tests `RC.bt:278` (only while empty), `RC.bt:288` (modified Up left to the page), `a11y.bt:557` (focus returns to the box) | | 1 | — |
| 10-30 | 10 Shortcuts | Message focus T: thread | Done | `pages/chat/ChannelMessage.tsx:235` (opens the thread with the reply box focused); tests `CM.t:447` "so does T on the message", `:453`, `:468` | | 2 | — |
| 10-31 | 10 Shortcuts | Message focus E: edit | Done | `ChannelMessage.tsx:226` (author only, not on a sending row); tests `CM.t:606` (E on a broadcast row edits the channel row), `a11y.bt:551` (real key E, Esc returns focus), `CM.t:215` (E typed in the picker does not edit) | | 2 | — |
| 10-32 | 10 Shortcuts | Message focus U: unread | Done | `ChannelMessage.tsx:229` → `onMarkUnread`; tests `CM.t:313-390` (U, held key acts once, refused U, not on my own message), `MessageActions.test.tsx:103` | | 2 | — |
| 10-33 | 10 Shortcuts | Message focus P: pin | Missing | No key handler, no menu item, no pin data (`src/api/types.ts`, `docs/flow-chat/api-contract.md` have no pins). `todo:358`: "Hidden until their own slices: … Pin …", never scheduled. The /dev/ui gallery shows a disabled "Pin to channel" item (`UiGallery.tsx:198`) | Spec 6.5 lists "Pin to channel (P)" in the message menu, which Phase 2 includes ("all items except Remind"); the Pins tab is Phase 3. Judgement call: needs a ruling on whether Pin waits for Phase 3. Needs model, route, event, system message, menu item, key | 2 | M |
| 10-34 | 10 Shortcuts | Message focus L: link | Done | `ChannelMessage.tsx:232` → `copyLink`; tests `CM.t:397-432` (copies, says so, refused copy, not on deleted/sending, not with a modifier) | | 2 | — |
| 10-35 | 10 Shortcuts | Message focus S: save | Not started (later phase) | No handler or Save item; Saved is Phase 3 (`todo:752` "Save for later (Saved, Phase 3)"). `layout/Sidebar.tsx:318` has a Saved link behind `chatRedesign` with no route | Whole Saved feature plus the toolbar button and key | 3 | L |
| 10-36 | 10 RTL | Mirror the layout with logical CSS properties | Partial | `src/rtl.test.ts` fails on any physical `ml-/pr-/left-/text-left/border-l…` class across `src`; sf code uses `ms-/pe-/start-/end-/border-s` (e.g. `InspectorFrame.tsx:34`, `Sidebar.tsx`) | No RTL mode exists (`index.html:2` `dir="ltr"`, no locale or direction switch), so the mirrored layout has never been exercised; RTL pass is Phase 4 | 4 | M |
| 10-37 | 10 RTL | Mirror chevrons and arrows | Partial | `components/sf/Icon.tsx:26` (`flip` → `rtl:-scale-x-100`), used by Send (`RichComposer.tsx:410`), submenu chevron (`Menu.tsx:350`), thread-summary chevron (`MessageParts.tsx:205`); Menu/toolbar arrow keys swap in RTL (`Menu.tsx:177,338`, `MessageToolbar.tsx:190`) | File-card collapse chevron is not flipped (`MessageFiles.tsx:211`); never exercised in RTL [app check] | 4 | S |
| 10-38 | 10 RTL | Mirror the panel side | Partial | Thread/file panel uses logical placement `layout/InspectorFrame.tsx:34` (`sm:end-0 … sm:border-s … slide-in-end`); popup placement is direction-aware `layers.tsx:97-110` | [app check] never exercised in RTL | 4 | S |
| 10-39 | 10 RTL | Don't mirror numbers | Not started (later phase) | Counts use `tabular-nums` only (e.g. `Badge.tsx:11`); nothing sets direction on numbers | No RTL pass yet | 4 | S |
| 10-40 | 10 RTL | Don't mirror timestamps | Not started (later phase) | Times are plain text in a `<p>` that follows the row direction (`ChannelMessage.tsx:179`); no `dir="ltr"` | No RTL pass yet | 4 | S |
| 10-41 | 10 RTL | Don't mirror code | Partial | Code blocks `dir="ltr"` at `pages/chat/MessageBody.tsx:165` | Inline `code` sits inside a `dir="auto"` paragraph and isn't forced LTR [app check] | 4 | S |
| 10-42 | 10 RTL | Don't mirror task keys | Done | `<bdi dir="ltr">` around keys: `MessageBody.tsx:56,79,137,142`, `MessageParts.tsx:232,260`, `TaskEventCard.tsx:39` | | 1 | — |
| 10-43 | 10 RTL | Don't mirror media controls | Not started (later phase) | No audio or video player built (voice and video messages are Phase 4) | | 4 | M |
| 10-44 | 10 RTL | Western digits | Done | Dates and times use `en-GB` (`src/lib/format.ts:48,52`); no Arabic-Indic locale anywhere (`toLocale*`/`Intl` grep) | The UI is English-only today, so this holds trivially | 4 | — |
| 10-45 | 10 RTL | Use `body-ar` for Arabic text | Partial | Utility `sf-body-ar` exists (`src/index.css:355`, 14/26) and is shown in the gallery (`pages/dev/UiGallery.tsx:121`) | Nothing applies it to Arabic message text (no `:lang(ar)` rule, no script detection); Arabic text uses the Latin body style. The Readex Arabic subset is loaded (`@fontsource-variable/readex-pro` includes `arabic`) | 4 | S |
| 10-46 | 10 RTL | `dir="auto"` on message bodies | Done | `pages/chat/MessageBody.tsx:159` (paragraphs), `:179` (list items); quotes recurse into paragraphs (`:168-172`) | No test asserts `dir="auto"` | 1 | — |
| 11-01 | 11 NFR | Message delivery under 200 ms p95 within a region | Missing | Only the mock backend exists: `src/mocks/latency.ts:2` adds 150-300 ms of fake latency; real transport is a stub (`src/lib/realtime.ts:99` `createUnconnectedClient`); no measurement anywhere | Backend target: needs the real service and a latency measurement | 1 | L |
| 11-02 | 11 NFR | 60 fps scrolling with 10,000 loaded messages (virtualization) | Partial | Virtualized with TanStack Virtual: `pages/chat/MessageList.tsx:3,148`, only `getVirtualItems()` rows mount (`:336,352`); scroll behaviour tests `MessageList.browser.test.tsx:160-314` | No 10,000-message load test or frame-rate measurement; browser tests use small lists. [app check] | 1 | M |
| 11-03 | 11 NFR | Channel switch time to interactive under 300 ms when cached | Partial | Messages and channels are TanStack Query caches (`src/main.tsx:16` `staleTime: 30_000`; `api/chat.ts:22` infinite query per channel), so a cached channel renders without waiting | No measurement or budget test. [app check] | 1 | S |
| 11-04 | 11 NFR | Offline send queue | Done | `src/lib/sendQueue.ts:36` (waits while offline, sends in order, backoff 1 s to 30 s, `wake` on `online`), `src/api/sendQueue.ts:31-45`; tests `sendQueue.test.ts:48,62,74,102` | Queue is in memory only: a queued message is lost on reload (spec doesn't ask for persistence) | 1 | — |
| 11-05 | 11 NFR | Audit log for admin actions: delete | Missing | No audit record anywhere (grep `audit` in `src` finds only seed task text; none in `docs/flow-chat/api-contract.md`) | Backend concern; mock keeps no log. Admin deletes (messages, files) are untracked | 2 | L |
| 11-06 | 11 NFR | Audit log for admin actions: archive | Missing | same | Channel archive has no audit entry | 2 | L |
| 11-07 | 11 NFR | Audit log for admin actions: permission changes | Missing | same (`whoCanPost`, default channel, role changes) | no audit entry | 2 | L |
| 11-08 | 11 NFR | Tests: unit tests for message grouping | Done | `rows.t:17-55` (`canContinue`, incl. the 5-minute and day boundaries), `:70` | | 1 | — |
| 11-09 | 11 NFR | Tests: unit tests for unread logic | Done | `rows.t:78-135` (New line, unread summary), `readState.test.tsx`, `markRead.test.ts`, `src/lib/channels.test.ts:136` | | 1 | — |
| 11-10 | 11 NFR | Tests: unit tests for mention parsing | Done | `src/lib/mentions.test.ts:18`, `src/lib/messageBody.test.ts:39`, `src/lib/mentionQuery.test.ts` | | 1 | — |
| 11-11 | 11 NFR | Tests: unit tests for task-key parsing | Done | `src/lib/mentions.test.ts:4` (`parseTicketKeys`), `src/lib/messageBody.test.ts:39,58` | Two different key patterns are in use (Notes 5) | 1 | — |
| 11-12 | 11 NFR | Tests: unit tests for autoformat | Partial | Browser-level only: `RC.bt:97` (inline `*bold*`, `_italic_`, `~strike~`, `` `code` ``), `RC.bt:118` ("- " list) | No unit test of `composer/markdown.ts`; `"> "` quote, `"1. "` ordered list and the code fence are never asserted (the `RC.bt:118` title says quote, the body checks only the list) | 1 | S |
| 11-13 | 11 NFR | Tests: API tests | Done | Mock API: `src/mocks/chat.test.ts` (messages, send, reply, react, edit, remove, channels, read state), `chatFiles.test.ts`, `channelDetails.test.ts`, `activity.test.ts`; transport `src/lib/http.test.ts`; hooks `src/api/*.test.tsx` | Tests run against the mock and the http mapping only; there is no real backend to test | 1 | — |
| 11-14 | 11 NFR | Tests: a real-time event test | Done | `src/mocks/realtime.test.ts:40-175` (delivery per event type, hub relay), `src/api/queryKeys.test.ts:21,48` (event → query keys), `src/mocks/chat.test.ts:399` (each write publishes `messageChanged`), `src/mocks/mentions.test.ts:149` | `src/layout/RealtimeBridge.tsx` and the real socket client have no test (real client is a stub) | 1 | — |
| 11-15 | 11 NFR | Tests: end-to-end test for the send flow | Missing | No e2e tool or config (no Playwright/Cypress test project; `vite.config.ts` has only the `unit` and `browser` vitest projects); no test renders `ChannelPage`. Nearest: `RC.bt:65` (Enter sends, with a stub `onSend`), `sendQueue.test.ts`, `mocks/chat.test.ts:186` | A test that drives composer → queue → mock API → list | 1 | L |
| 11-16 | 11 NFR | Tests: end-to-end test for the react flow | Missing | Nearest: `src/api/chatReact.test.tsx:29,38` (optimistic toggle and revert), `CM.t:196-222` | Same | 2 | M |
| 11-17 | 11 NFR | Tests: end-to-end test for thread reply with broadcast | Missing | Nearest: `ThreadComposer.browser.test.tsx:49` (Also send checkbox, stub `onSend`), `CM.t:543-580`, `mocks/chat.test.ts` reply tests | Same | 2 | M |
| 11-18 | 11 NFR | Tests: end-to-end test for the upload flow | Missing | Nearest: `uploads/useUploads.test.tsx:24`, `uploads/UploadTray.test.tsx`, `RC.bt:326-380` (picker, paste, drop) | Same | 2 | M |
| 11-19 | 11 NFR | Tests: end-to-end test for the schedule flow | Not started (later phase) | Scheduled send is Phase 3 and not built | Feature first | 3 | M |
| 12.0-01 | 12 P0 AC | Every primitive matches the reference CSS in both themes | Done | Values compared with `design/spark-flow-components.reference.css`: Button `Button.tsx:36-38` ↔ `.sf-btn`; IconButton sizes ↔ `.sf-iconbtn`; `Badge.tsx:11,31,50` ↔ `.sf-count/.sf-tag/.sf-kbd`; Toggle `Toggle.tsx:30-39` ↔ `.sf-toggle` (36×20, 16px knob); Avatar `Avatar.tsx:4-15` ↔ `.sf-avatar*` incl. dark tiers; Toast `Toast.tsx:72` ↔ `.sf-toast`; Modal `Modal.tsx:68-93` ↔ `.sf-modal`; Tooltip `Tooltip.tsx:94` ↔ `.sf-tooltip`. Tokens equal the design file in both themes: `src/styles/flowTokens.test.ts`; axe in light and dark `a11y.bt` | No automated pixel or class-by-class check against the reference CSS; [app check] | 0 | — |
| 12.0-02 | 12 P0 AC | Storybook stories (or equivalent) exist for each state | Partial | `/dev/ui` gallery `src/pages/dev/UiGallery.tsx` (route `src/router.tsx:50`, prototype and dev builds only): Light and Dark columns with Buttons, Icon buttons (+ split button), Avatars (presence, app, sizes, facepile), Badge/Tag/Kbd, Tooltip, Menu (+ submenu, radio items), Toggle and Checkbox, Token input (+ error), Modal and Toast | Static states for hover, focus-visible and active aren't pinned (only reachable by interacting); no disabled Checkbox; Popover, Tabs, Announcer not shown; the gallery has no test or screenshot check. [app check] | 0 | S |
| 12.0-03 | 12 intro | After each phase: run tests and an accessibility pass (focus order, ARIA roles, contrast) | Done | Every slice in `tasks/todo.md` records tests plus axe in both themes, 390px and 44px checks and real-key checks (e.g. todo lines 378, 536, 598, 694, 759); `a11y.bt` holds the axe suite (many files' surfaces); focus tests `a11y.bt:525-572` | Focus order has no systematic test beyond these named cases | 0-2 | — |
| 12.1-01 | 12 P1 AC | Channel artboard reproduced (roll-up of the nine parts below) | Partial | Eight of nine parts are complete, see 12.1-02 to 12.1-10 | The hover toolbar lacks Forward and Save for later (12.1-07). [app check] pixel comparison with the artboard | 1 | M |
| 12.1-02 | 12 P1 AC | Channel artboard: day sections | Done | `messageRows.ts:60` `buildRows` wraps each day; `MessageList.tsx:488-503` `DayDivider`, sticky pill `:404-411`; test `rows.t:70`, `:57` (labels) | | 1 | — |
| 12.1-03 | 12 P1 AC | Channel artboard: grouping | Done | `messageRows.ts:23` `canContinue`; `ChannelMessage.tsx:247-257` continuation row (time in gutter, name for screen readers only); tests `rows.t:17-55`, `CM.t:153` | | 1 | — |
| 12.1-04 | 12 P1 AC | Channel artboard: mention row | Done | `ChannelMessage.tsx:210` (`bg-sf-surface-mention`, muted text steps up to secondary `:213`); test `CM.t:120` | | 1 | — |
| 12.1-05 | 12 P1 AC | Channel artboard: task unfurl | Done | `ChannelMessage.tsx:203` → `MessageBody.tsx` `TaskUnfurl` (`:66-`), live status via `api.tickets.resolve`; test `CM.t:103` | | 1 | — |
| 12.1-06 | 12 P1 AC | Channel artboard: New line | Done | `MessageList.tsx:506-512` `NewLine` (1px accent-fill rule, "New" 12/600 in accent); `buildRows`; unread bar `:384-402`; tests `rows.t:78-110`, `MessageList.browser.test.tsx:234,284` | | 1 | — |
| 12.1-07 | 12 P1 AC | Channel artboard: hover toolbar | Partial | `pages/chat/MessageToolbar.tsx` (hover or focus, 16px above the row, ✅ 👀 🙌, Add reaction, Reply in thread, More); tests `a11y.bt:415,431,502`, `MessageToolbar.test.tsx` | Spec 6.4 lists Forward and Save for later (S) in the bar; neither is there (`todo:358` hid Pin, Save, Forward until their own slices). Forward is in Phase 2's "all items" and has no home yet; Save belongs to Phase 3 | 2 | M |
| 12.1-08 | 12 P1 AC | Channel artboard: reaction tooltip | Done | `pages/chat/MessageParts.tsx:121` (`Tooltip` with who reacted and `:alias:`); test `CM.t:196` | | 1 | — |
| 12.1-09 | 12 P1 AC | Channel artboard: empty composer | Done | `pages/chat/composer/RichComposer.tsx` placeholder `Message #channel` (`ChannelPage.tsx:153`), formatting row, Send; axe on "composer" surface `a11y.bt:170` | | 1 | — |
| 12.1-10 | 12 P1 AC | Channel artboard: typing line | Done | `pages/chat/ChannelTyping.tsx` (20px line under the composer, names in 600, "Several people are typing…"); test `typingLine.test.ts` | | 1 | — |
| 12.1-11 | 12 P1 AC | Message states artboard reproduced (roll-up of the six parts below) | Done | See 12.1-12 to 12.1-17 | [app check] | 1 | — |
| 12.1-12 | 12 P1 AC | Message states: inline edit | Done | `RichComposer.tsx:377` (Cancel, Save, "Esc to cancel · Enter to save"); tests `RC.bt:251-275`, `a11y.bt:547` | | 1 | — |
| 12.1-13 | 12 P1 AC | Message states: (edited) | Done | `ChannelMessage.tsx:200`; test `CM.t:135` | | 1 | — |
| 12.1-14 | 12 P1 AC | Message states: deleted placeholder | Done | `ChannelMessage.tsx:189` ("This message was deleted." only with replies); test `CM.t:140`, `rows.t:103` | | 1 | — |
| 12.1-15 | 12 P1 AC | Message states: failed with Retry / Delete | Done | `ChannelMessage.tsx:276-288` ("Not sent." Retry · Delete, accent, alert icon); test `CM.t:298` | | 1 | — |
| 12.1-16 | 12 P1 AC | Message states: sending | Done | `ChannelMessage.tsx:179` ("Sending…" as the time); test `CM.t:291` | | 1 | — |
| 12.1-17 | 12 P1 AC | Message states: Undo toast | Done | `MessageActions.tsx:71-80` ("Message deleted", Undo, `TOAST_MS = 5000` `Toast.tsx:7`); tests `MessageActions.test.tsx:129`, `layers.t:213` | | 1 | — |
| 12.1-18 | 12 P1 AC | Grouping passes its unit tests | Done | `rows.t:17-55` (8 tests incl. 10:05:00 true vs 10:05:01 false, and 23:58 → 00:01 breaks the day); all passed in the full run | | 1 | — |
| 12.1-19 | 12 P1 AC | Unread logic passes its unit tests | Done | `rows.t:78-135`, `readState.test.tsx` (14 tests), `markRead.test.ts`, `channels.test.ts:136`; all passed in the full run | | 1 | — |
| 12.2-01 | 12 P2 AC | Thread panel artboard reproduced (roll-up of 12.2-02 to 12.2-07) | Partial | See the six parts below | Width 384 not 420 (ruling) and panel chrome is the CRM inspector frame, not `sf` | 2 | M |
| 12.2-02 | 12 P2 AC | Thread panel: parent selected | Done | `MessageList.tsx:140` (`m.id === threadOpen` → `'on'`), `ChannelMessage.tsx:210` (`bg-sf-surface-selected`); test `CM.t:128` | | 2 | — |
| 12.2-03 | 12 P2 AC | Thread panel: right panel | Different from spec (approved ruling: panel stays 384px) | `layout/InspectorFrame.tsx:34` (`sm:w-[24rem]`), `pages/chat/ThreadInspector.tsx:31-150`; ruling `todo:462` | Spec 6.7 says 420px. Frame is the Spark CRM inspector: header eyebrow "Thread · #channel" in uppercase accent plus the parent's first line as the title (`ThreadInspector.tsx:57-59`), where spec has "Thread", "#channel"; replies divider and empty line use old tokens (`ThreadInspector.tsx:75,79,86` `text-xs text-fg-muted`, `bg-line-subtle`); panel Close is a raw lucide button. [app check] | 2 | M |
| 12.2-04 | 12 P2 AC | Thread panel: 3 replies | Done | `ThreadInspector.tsx:88-107` replies as `ChannelMessage compact`, grouping by `canContinue`, "N replies" divider `:75-79` | | 2 | — |
| 12.2-05 | 12 P2 AC | Thread panel: broadcast reply | Done | Channel row "replied to a thread:" + link `ChannelMessage.tsx:262`, stands alone (`messageRows.ts:23`); in the panel "↪ Also sent to #channel" `:269-272`; tests `CM.t:543-580`, `rows.t:32` | | 2 | — |
| 12.2-06 | 12 P2 AC | Thread panel: "Also send to #backend" | Done | `pages/chat/ThreadComposer.tsx` (checkbox, off after each send, rich composer with formatting row behind Aa); tests `ThreadComposer.browser.test.tsx:43-71`, `RC.bt:308` | | 2 | — |
| 12.2-07 | 12 P2 AC | Thread panel: Jump to latest | Done | `MessageList.tsx:428-443` (centred accent pill with the count, "Jump to latest · N new"); test `MessageList.browser.test.tsx:200` | | 1 | — |
| 12.2-08 | 12 P2 AC | Add a reaction artboard reproduced | Partial | `pages/chat/EmojiPicker.tsx:118` (352×412, search, category tabs, 9-column grid of 36px cells, footer preview with name and aliases, arrow keys, typing goes to search), anchored by `Popover` at the toolbar `MessageToolbar.tsx:239-250`; tests `EmojiPicker.test.tsx:13-55`, `a11y.bt:526` | Footer has no skin tone (`EmojiPicker.tsx:37-38` "Skin tones and custom emoji come later"); no "Custom" category tab | 2 | M |
| 12.2-09 | 12 P2 AC | File menu + details artboard reproduced (roll-up of 12.2-10 to 12.2-12) | Partial | See the three parts below | | 2 | M |
| 12.2-10 | 12 P2 AC | File menu + details: card hover actions | Done | `pages/chat/MessageFiles.tsx:46-100` (action pill: Download, Share, Details, More; shows on hover or focus; border to `line-strong` `:237`); 380px card `:168,237`; "PDF ▾" label `:201-211`; tests `MessageFiles.test.tsx`, `a11y.bt:288` | | 2 | — |
| 12.2-11 | 12 P2 AC | File menu + details: file menu | Partial | `MessageFiles.tsx:104-150` (Download, Share, Details, Create task from file, Copy link to file, Edit file details, Delete file in `accent`) | "Save for later" and "Add to folder ▸" are missing (`todo:752` defers them to Phase 3: Saved, folders) | 2 | M |
| 12.2-12 | 12 P2 AC | File menu + details: File details panel | Partial | `pages/chat/files/FileInspector.tsx:79-133` (preview, name, type and size, Download / Share / Open, Uploaded by, Uploaded, Shared in, Access, Description with Edit file details); tests `FileInspector.test.tsx:54-96`, `a11y.bt:321` | No "Folder" row (folders are Phase 3, `todo:752`) | 2 | S |
| 12.2-13 | 12 P2 AC | Add people artboard reproduced | Different from spec (approved rule in CLAUDE.md: Toast only for Undo) | `pages/chat/ChannelMembers.tsx:421` ("Names or emails" token input with people, teams and email chips), `:192` Guest tag, `lib/invites.ts:29-30` (helper text, exact copy), `:466-470` admin-only block (eye icon, switch), `:415` footer "Add N people"/"Add people" disabled at 0; tests `a11y.bt:274,751`, `layers.t:428` | Spec: "On success, show a toast"; the modal closes and the channel shows a system message instead. Singular reads "Add 1 person" (spec "Add N people") | 2 | — |
| 12.2-14 | 12 P2 AC | Channel details artboard reproduced | Partial | `pages/chat/ChannelDetails.tsx:110-116,162` (tabs About, Members N, Settings for admins), About cards with Edit, Linked project, Copy channel link, Leave channel; header star and notification-level button; tests `ChannelDetails.test.tsx`, `a11y.bt:255,647,712` | No Tabs and Integrations tabs, no Start a call (Phase 4), linked project has no Change, no details for DMs: all approved rulings (`todo:589`). Rulings leave the artboard's tab row and header not fully reproduced | 2 | S |
| 12.2-15 | 12 P2 AC | Channel notifications artboard reproduced | Partial | `pages/chat/NotifyLevelMenu.tsx:8-50` ("Notify me about" with All new messages / Mentions and keywords / Nothing as radio items, then Mute channel), header bell `ChannelHeader.tsx:65,118`; tests `a11y.bt:193`, `ChannelHeader.test.tsx` | No "Desktop, mobile and email…" item and no Do Not Disturb note with a Preferences link; "keywords" does nothing (ruling `todo:527`: wait for Preferences) | 2 | M |
| 12.3-01 | 12 P3 AC | Search artboard reproduced | Not started (later phase) | Only the top-bar quick find exists (`layout/GlobalSearch.tsx`, `layout/searchShortcuts.ts`); no results view, filters or index | Search view with filters and index | 3 | L |
| 12.3-02 | 12 P3 AC | Saved artboard reproduced | Not started (later phase) | Sidebar link only, behind `chatRedesign` (`layout/Sidebar.tsx:318`); no `/saved` route in `src/router.tsx` | Saved view, data, Remind me | 3 | L |
| 12.3-03 | 12 P3 AC | Drafts & scheduled artboard reproduced | Not started (later phase) | Sidebar link only (`Sidebar.tsx:314`); no `/drafts` route; drafts are saved per channel/thread (`api/draftSaver`) but have no list view | Drafts, Scheduled, Sent view | 3 | L |
| 12.3-04 | 12 P3 AC | Threads artboard reproduced | Not started (later phase) | Sidebar link only (`Sidebar.tsx:307`); no `/threads` route. Following is stored (`todo:462`) but nothing lists it | Threads view | 3 | L |
| 12.3-05 | 12 P3 AC | / shortcuts artboard reproduced | Not started (later phase) | No slash-command code (grep) | Slash menu, built-ins, app commands | 3 | L |
| 12.3-06 | 12 P3 AC | Schedule send artboard reproduced | Not started (later phase) | No scheduling code (grep `schedul`) | Schedule send menu and backend | 3 | L |
| 12.3-07 | 12 P3 AC | Text snippet artboard reproduced | Not started (later phase) | No snippet code; `todo:752` "Text snippet and code highlighting (Phase 3)" | Snippet modal and code card | 3 | M |

#### Notes

1. Phase 4 has no AC line in section 12 (lines 686-706 are a bullet list only), so there is no Phase 4 AC row. Phase 4 items that overlap section 10 (RTL, media controls) appear under 10-36 to 10-45.
2. Possible live defect, [app check]: ⌘K / Ctrl+K inside the composer is "Link" for Lexical (`composer/KeysPlugin.tsx:75-78`) and "focus top-bar search" for `GlobalSearch.tsx:213`, a `document` listener with no `defaultPrevented` guard. Lexical's handler runs first and does not stop propagation, so both appear to fire. The spec itself lists both shortcuts (6.8 and 10), so it needs a decision about which wins in the composer.
3. 6.2 says the list is `role="log"` with `aria-live="polite"`; the code is `role="log" aria-live="off"` plus an `sr-only` polite announcer (`MessageList.tsx:351,444`, test `MessageList.browser.test.tsx:145`). The behaviour is deliberate and tested but I found no recorded ruling for it in `tasks/todo.md`.
4. Pin (P) and Save (S) sit in different phases in the spec: Pin to channel is a Phase 2 menu item but the Pins tab is Phase 3; Save for later is a Phase 2 toolbar item but Saved is Phase 3. The code defers both (`todo:358`). I graded Pin as Missing and Save as Not started; a ruling would settle both.
5. Two task-key patterns coexist: `src/lib/mentions.ts:3` `TICKET_KEY = /\b[A-Z]{2,5}-\d+\b/g` (feeds `linkedTicketKeys` through the mock and the seed) and `src/lib/messageBody.ts:28` `TASK_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/` (the spec pattern, used to build body nodes and chips). A key such as `S3-12` becomes a chip but is not in `linkedTicketKeys`. Project keys are 2-5 letters (`pages/projects/projectForm.ts`), so it rarely shows.
6. Spec 9 and 6.3: task chips show status only when the viewer can see the task. `src/mocks/tickets.ts:53` `resolve` returns any task by key with no per-viewer filter (not verified further; belongs to the permissions audit).
7. There is no CI configuration in the repo, so "contrast verified in CI" is met only as far as the checks exist in `npm test`.
8. `docs/flow-chat/audit/` already holds screenshots (`01-backend-light.jpg` …); I did not open or touch them.

#### TEST INVENTORY

**Full-suite run** (`npx vitest run < /dev/null`, log at `/private/tmp/claude-501/-Users-ezzelden-Work-ezz-WORK-Spark-DEV-Spark-Flow/206d3e21-61db-49e1-96f2-9f52babdb5c5/scratchpad/audit/G-vitest.log`): **Test Files 127 passed (127); Tests 1289 passed (1289); 0 failed; 42.3 s.** By file glob: 119 unit files (Node/jsdom) and 8 `*.browser.test.tsx` files (headless Chromium through Playwright); both projects ran in this single command.

| Area | Covered? | Files and tests |
|---|---|---|
| (1) Message grouping | Yes | `src/pages/chat/messageRows.test.ts`: describe "canContinue (spec 6.2 grouping rule)" has 8 tests ("same author, same day, up to 5 minutes apart" checks 10:05:00 true and 10:05:01 false; "another author breaks the group"; "a new day breaks the group even within 5 minutes"; "a message with thread replies ends its group"; "a reply also sent to the channel stands alone there, before or after (spec 6.7)"; "cards (task events, comments) never group, before or after"; "thread replies group by the same rule"; "system messages never group"); describe "buildRows": "wraps each day in a section and marks continuations", "keys are stable…". Also `src/pages/chat/ChannelMessage.test.tsx:153` "a continuation hides author and time visually but keeps them first for screen readers" |
| (2) Unread "New" line | Yes | `src/pages/chat/messageRows.test.ts`: "puts the New line before the first message someone else sent after my marker, and starts a group there", "has no New line when nothing is newer than the marker, or there is no marker", "has no New line while older messages that could hold the first unread one are not loaded yet", "system messages are never unread: no New line before them", describe "unreadSummary". `src/pages/chat/readState.test.tsx` (14 tests: U moves the New line and holds the read, a refused U, marking read ends the hold, opening marks read up to the newest, Esc `markOpenChannelRead`, `useReadHoldScope`). `src/pages/chat/markRead.test.ts` (`shouldMarkRead`, `readUpTo`). `src/lib/channels.test.ts` (`sidebarRowState`, `unreadMentions`). `src/mocks/chat.test.ts:112-150,489` (unreadCount per person, markRead). Browser: `src/pages/chat/MessageList.browser.test.tsx` "opens at the New line with the unread bar…" (:234), "the unread bar offers Mark as unread…" (:284), "opening at the New line, the list itself marks nothing read" (:295), "opening at the newest message marks it read" (:307), "while the read is held (after U)…" (:314). U on a row: `ChannelMessage.test.tsx:309-390` |
| (3) Mention parsing | Yes | `src/lib/mentions.test.ts`: describe "parseMentions" ("reads @all, @[Name](userId), @PROJECTKEY and @TASK-KEY once each, in order"; "ignores e-mail addresses, lowercase keys and bare words"), "segments" (2), "unnamedKeys". `src/lib/messageBody.test.ts`: "turns mentions, channel links, task keys and links into their own nodes" (:39), describe "mentionsOf and bodyTaskKeys" (:117). `src/lib/mentionQuery.test.ts` (the @ and # popup: `activeMention`, `mentionOptions`, `insertMention`, `keepDismissed`, `channelOptions`). Also `src/lib/mentionDirectory.test.ts`, `src/lib/mentionLink.test.ts`, `src/mocks/mentions.test.ts` (the feed), `src/pages/chat/composer/bodyEditor.test.ts:38` (pills typed into the editor). Note: `src/mocks/text*.test.ts` does not exist; `src/mocks/text.ts` only re-exports `parseMentions` and `parseTicketKeys` from `src/lib/mentions.ts` |
| (4) Task-key parsing | Yes | `src/lib/mentions.test.ts`: describe "parseTicketKeys" (3 tests: unique keys in order; ignores lowercase, single letters, over-long prefixes and glued keys; empty text), describe "unnamedKeys". `src/lib/messageBody.test.ts`: :39 (keys become `task` nodes), :58 "a project mention stays a project, and keys follow the spec pattern (letters then letters or digits)", :117 `bodyTaskKeys`. `src/mocks/chat.test.ts:187` "parses ticket keys, bumps lastMessageAt and publishes". `src/pages/chat/composer/bodyEditor.test.ts:65` "code keeps task keys and addresses as text". `src/pages/chat/ChannelMessage.test.tsx:103` chip with live status. `src/mocks/tickets.test.ts:260` `resolve`. Gap: the two patterns differ (Note 5), and no test covers "prefix is a project key the viewer can see" |
| (5) Composer markdown autoformat | Partly | Only in the browser project: `src/pages/chat/composer/RichComposer.browser.test.tsx` "autoformats *bold*, _italic_, ~strike~ and `code` as you type" (:97) and "autoformats "- " into a list and "> " into a quote" (:118; its body asserts only the list). Source `src/pages/chat/composer/markdown.ts` (`COMPOSER_TRANSFORMERS`) has no unit test. Not asserted anywhere: `"> "` quote, `"1. "` ordered list, the ``` code fence. Related but not autoformat: `src/pages/chat/composer/bodyEditor.test.ts` (editor ⇄ body round trip, includes quote, lists and fence as stored text) and `src/lib/messageBody.test.ts:12-35` (`parseBody` of sent text) |

Other keyboard and focus tests used above: `src/pages/chat/useChannelKeys.test.tsx` (12 tests), `src/pages/chat/useChannelKeys.browser.test.tsx` (1, real keys), `src/pages/chat/channelKeys.test.ts` (7), `src/pages/chat/ChannelShortcuts.test.tsx` (7), `src/components/sf/layers.test.tsx` (focus trap and restore, Esc stack, menu keys), `src/pages/chat/a11y.browser.test.tsx` (axe in light and dark on the chat surfaces, focus after reactions and edits, 44px touch checks), `src/styles/flowTokens.test.ts` (token values and contrast), `src/rtl.test.ts` (logical classes only).
