# Flow Chat Redesign: change spec for Claude Code

Approved October 27, 2026. Prepared for a Claude Code session working in the Spark Flow repository.

This spec turns the approved redesign into code changes. It is stack-agnostic: map every item onto the framework, styling approach, data layer and real-time transport the repo already uses. It replaces the earlier `SLACK_FEATURES.md` draft. Where the two disagree, this file wins.

## 0. How to use this spec

- Read sections 1–4 first, then implement in the phases of section 12, one vertical slice at a time: migration, API, event, UI, tests.
- `design/` holds three files. Treat them as the source of truth for every visual value:
  - `spark-flow-tokens.css`: CSS variables, light and dark.
  - `spark-flow-tokens.json`: the same tokens as data.
  - `spark-flow-components.reference.css`: the approved component CSS, with every padding, size and state.
- Port the reference CSS to the repo's styling system (CSS modules, Tailwind, styled-components, etc.). Don't import it wholesale unless the repo uses plain global CSS. Keep values exact; don't snap them to a framework scale.
- Items marked **OPEN** need a decision from the product owner. Ask before building them.
- Don't change modules outside chat (Home, Projects, My tasks, Teams, Dashboard, Time & cost) beyond the shared sidebar and top bar changes in section 5.

Design references for humans (claude.ai, private to the owner until shared):

- Design canvas "Flow Chat Redesign": 27 screens plus shared parts.
- Design system "Spark Flow": tokens, brand book and 19 component guidelines.

## 1. Goal and scope

Make Flow's chat match the standard of Slack-class chat tools: fast to scan, actions on hover, threads in a side panel, a rich composer, files, mentions, search and follow-up tools. Keep Flow's own identity (Spark Red and Ink, Readex Pro, Tabler icons) and Flow's own concepts (tasks, projects, pages).

**What stays the same**

- The sidebar structure: logo header; Work (Home, Projects, My tasks, Teams); Manage (Dashboard, Time & cost); Channels; Direct messages; Projects; Settings at the bottom.
- The top bar's items: sidebar toggle, search, notifications bell, the "SE" control, and the profile (avatar, name, role, chevron).
- The main pane as a rounded card on the dark frame.

**Naming (Flow-native, not Slack's):** Huddle → Call, Canvas → Page, Lists → Task list (Pro), Workflow → Automation, Later → Saved, Add to to-do → Create task.

**Out of scope:** the admin console, billing, and apps marketplace UI.

## 2. Current issues and the change

| # | Current (screenshots) | Change |
|---|---|---|
| 1 | Every row repeats the full date ("Wed 21 Oct, 10:03 AM"); no day separation | Day sections with a sticky date pill ("Friday, October 23", "Yesterday", "Today") and a jump-to-date menu; rows show time only |
| 2 | No grouping; each message repeats avatar and name | Group consecutive messages by the same author within 5 minutes (rule in 6.2) |
| 3 | Actions hidden behind "…"; popover with 6 emojis wrapping to 2 rows; empty space on others' messages | Hover toolbar: 3 quick reactions, add reaction, reply in thread, forward, save, more. More opens a structured menu (6.5) |
| 4 | Large "#backend" page title plus description; header actions only in "…" | 52px channel header: name ▾, star, topic, members facepile, Call ▾, notifications, search, more; tabs row below |
| 5 | Composer is a plain textarea with a hint line | Rich composer: formatting row, attach (+), formatting toggle, emoji, @, video message, voice message, /, split Send with Schedule (6.8) |
| 6 | "2 replies · 5d ago" only | Thread summary with reply avatars, count and last reply time; replies open in a right panel with "Also send to #channel" |
| 7 | Sidebar has no unread or mention state | Bold for unread, red count for mentions, muted and draft indicators, a Starred section, a Chat group (Threads, Activity, Drafts & sent, Saved) |
| 8 | Ticket keys are plain monospace text | Flow task keys become live chips with a status dot; the first one unfurls into a task card |
| 9 | Blue browser focus outline | Brand focus ring (`--focus-ring`) on every interactive element |
| 10 | Round avatars; colours unrelated to the brand | Rounded-square avatars in three Ink tones; presence dot |

## 3. Design foundations

### 3.1 Integrate the tokens

- Add `design/spark-flow-tokens.css` to the global stylesheet. Light is the default (`:root`); `[data-theme="dark"]` on any container switches it.
- If the repo uses Tailwind, extend the theme with the CSS variables instead of hex values, for example `colors: { surface: 'var(--surface)', 'text-secondary': 'var(--text-secondary)', accent: 'var(--accent)', ... }`. Map `spacing`, `borderRadius`, `boxShadow` and `zIndex` the same way. Add every token; don't reuse Tailwind's defaults.
- **Font:** Readex Pro, weights 300, 400, 500 and 600, with Latin and Arabic subsets. Load it from Google Fonts or self-host it (preferred for an app: `@fontsource-variable/readex-pro`). Never use weight 700.
- **Icons:** Tabler Icons, outline, `stroke={1.5}`. Use 20px by default, 18px in dense rows and 16px in chips. Use `@tabler/icons-react`, or the package that matches the framework.
- **Emoji:** render with the native emoji font stack (`"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji"`). Use emoji only for content and reactions, never as UI glyphs.

### 3.2 Colour roles (resolved values)

| Role | Light | Dark | Use |
|---|---|---|---|
| `app-frame` | `#121214` | `#0a0a0b` | Sidebar and the frame around the main card |
| `sidebar-hover` | `#1c1c1f` | `#1c1c1f` | Hovered sidebar rows |
| `sidebar-active` | `#2a2a2e` | `#2a2a2e` | Current channel or DM |
| `sidebar-text` | `#b4b4bb` | `#b4b4bb` | Read rows |
| `sidebar-text-strong` | `#ffffff` | `#ffffff` | Unread rows (weight 600), active row |
| `sidebar-text-muted` | `#8a8a93` | `#8a8a93` | Section labels, muted channels |
| `sidebar-accent` | `#f2453d` | `#f2453d` | Active row icon |
| `surface` | `#ffffff` | `#121214` | Main pane, panels, composer |
| `surface-hover` | `#f7f7f8` | `#1c1c1f` | Hovered rows and menu items |
| `surface-raised` | `#ffffff` | `#1c1c1f` | Menus, toolbar, modals (with a shadow token) |
| `surface-sunken` | `#f7f7f8` | `#0a0a0b` | Code, file icons, trays, search input |
| `surface-selected` | `#fef3dc` | `#2a2110` | Message whose thread is open, or a jump target (fades out after 2s) |
| `surface-mention` | `#fcf1f1` | `#2b1415` | Rows mentioning the viewer; the viewer's own reaction chips |
| `line` | `#d4d4d9` | `#2a2a2e` | Hairlines and dividers |
| `line-strong` | `#8a8a93` | `#6e6e76` | Borders of inputs, the composer and outlined buttons |
| `text` | `#0a0a0b` | `#ededef` | Content |
| `text-secondary` | `#4a4a51` | `#b4b4bb` | Topic, descriptions, system messages |
| `text-muted` | `#6e6e76` | `#8a8a93` | Timestamps, placeholders, counts |
| `accent` | `#b72126` | `#f2453d` | Red as text: links, "N replies", mention pills, destructive items |
| `accent-fill` | `#b72126` | `#b72126` | Red as fill: primary button, enabled Send, count badges, active tab rule |
| `accent-fill-hover` | `#9e1d21` | `#9e1d21` | Hover and pressed state of `accent-fill` |
| `danger-fill` | `#e7000b` | `#e7000b` | Delete confirm buttons (UX Phase 3: the kit's danger button) |
| `danger-fill-hover` | `#c10007` | `#c10007` | Hover and pressed state of `danger-fill` |
| `on-accent` | `#ffffff` | `#ffffff` | Text on `accent-fill` |
| `presence-active` | `#15803d` | `#15803d` | Active presence dot |
| `focus` | `#b72126` | `#f2453d` | Focus ring colour |
| `overlay` | `rgba(10,10,11,.5)` | `rgba(0,0,0,.64)` | Modal scrim |

Every text pair above meets 4.5:1, and every border or icon that identifies a control meets 3:1, in both themes. Keep red under about 10% of any screen.

*Amended by UX Phase 3 (one red):* Spark Red is the kit's `brand-500` `#b72126` (hover `brand-600` `#9e1d21`, tint `brand-50` `#fcf1f1`); red text in dark stays `#f2453d` because no brand red passes 4.5:1 on Ink there. Every confirm that deletes or removes uses `danger-fill`, the kit's danger button; archiving and confirms that destroy nothing stay `accent-fill`.

### 3.3 Type, spacing, radii, shadows, sizes, motion

- **Type** (Readex Pro):

  | Style | Size / line height / weight | Use |
  |---|---|---|
  | `display` | 28/36/600 | Channel intro |
  | `title` | 20/28/600 | Modals, full views |
  | `heading` | 16/24/600 | Channel name, panel titles |
  | `body` | 14/22/400 | Messages |
  | `body-strong` | 14/22/600 | Author names, unread rows |
  | `ui` | 14/20/400 | Rows, menus, inputs |
  | `ui-medium` | 14/20/500 | Buttons, tabs |
  | `small` | 13/18/400 | Thread summary, helpers, typing line |
  | `meta` | 12/16/400 | Timestamps; the minimum size |
  | `label` | 12/16/500, +0.12em, uppercase | Section labels |
  | `code` | 13/20 system mono | Code and task keys |
  | `body-ar` | 14/26 | Arabic body text, never letter-spaced |
  | `heading-ar` | 16/22 | Arabic headings, never letter-spaced |

- **Spacing:** 4, 8, 12, 16, 24, 32, 48, 64 (`--space-1` … `--space-16`). Nothing in between.
- **Radii:** `--radius-sm` 4 (inline code, kbd, 20px avatars); `--radius-md` 6 (controls, rows, 36px avatars); `--radius-lg` 12 (main card, composer, menus, modals, cards, toolbar); `--radius-full` (dots, badges, reaction chips, date pill).
- **Shadows:** `--shadow-toolbar` (message toolbar, date pill), `--shadow-menu` (menus, pickers, autocomplete, toasts), `--shadow-modal`, `--focus-ring`.
- **Sizes:**

  | Token | px | Element |
  |---|---|---|
  | `--size-avatar` | 36 | Message avatars |
  | `--size-avatar-sm` | 20 | Small avatars |
  | `--size-control` | 32 | Icon buttons |
  | `--size-input` | 36 | Inputs, labelled buttons |
  | `--size-topbar` | 56 | Top bar |
  | `--size-header` | 52 | Channel header |
  | `--size-tabs` | 40 | Tabs row |
  | `--size-sidebar` | 260 | Sidebar (resizable 200–420) |
  | `--size-panel` | 420 | Right panel (resizable 360–640) |

- **Motion:** 150ms for hovers, 300ms for menus, panels and toasts, 600ms for the selected-row fade. Easing `cubic-bezier(.2,.8,.2,1)`. Animate opacity and transform only. Honour `prefers-reduced-motion`.
- **States:**
  - Hover: rows use `surface-hover`; red fills use `accent-fill-hover`.
  - Keyboard focus: `--focus-ring`.
  - Input focus: `focus` border plus a 3px `surface-mention` halo.
  - Composer focus: only the border changes, to `text-secondary`.
  - Disabled: `surface-hover` fill, `line` border, `text-muted` label.

## 4. Screen inventory (design canvas → spec section)

| Artboard | Shows | Spec |
|---|---|---|
| Channel | Default channel: day sections, grouping, mention row, task unfurl, New line, hover toolbar, reaction tooltip, empty composer, typing line | 6.1–6.4, 6.6, 6.8 |
| Thread panel | Parent selected, right panel, 3 replies, broadcast reply, "Also send to #backend", Jump to latest | 6.7, 6.2 |
| Message actions + reminders | More menu with the Remind me submenu | 6.5 |
| Add a reaction | Emoji picker anchored to the toolbar | 6.6 |
| Message states | Inline edit, (edited), deleted placeholder, failed with Retry/Delete, sending, Undo toast | 6.3 |
| @ mentions, / shortcuts, Attach menu, Uploading files, Schedule send, Text snippet | Composer states | 6.8, 6.9 |
| File menu + details | File card hover actions, file menu, File details panel | 6.9 |
| Add people, Channel details, Channel notifications | Modals and popover | 6.10, 6.11 |
| Search results, Activity, Threads, Saved, Drafts & scheduled | Full views | 6.12 |
| Call in a channel, Channel page, New channel | P2 entry points | 6.13, 6.14 |
| Dark theme, Mobile ×3 | Theme and responsive | 3, 6.16 |

## 5. App shell changes

### 5.1 Sidebar (`app-frame`, full height, 260px, resizable 200–420, width persisted per user)

Order:

1. Logo header. Keep the existing Spark logo and the "FLOW" label. Add a New message icon button (white square) at the end.
2. Work, then Manage. Unchanged items, restyled as `sf-side-item` rows.
3. **Chat (new, collapsible):**
   - Threads.
   - Activity, bold with a red count while there are unread mentions or reactions.
   - Drafts & sent, with a muted count of drafts plus scheduled messages.
   - Saved, with a muted count of in-progress items.
4. **Starred (new):** starred channels and DMs.
5. Channels: add button and options on hover; "Add channels" row at the end.
6. Direct messages: avatar with presence; group DMs show their names; the viewer's self-DM is labelled "you".
7. **Apps (new):** Flowbot, which delivers reminders and notices.
8. Projects (existing).
9. **Call bar (P2, new):** shown only while the viewer is in a call, above Settings.
10. Settings, pinned at the bottom.

Row rules (28px rows, 2px gaps, `radius-md`, 18px icon, `ui` type):

| State | Style |
|---|---|
| Read | `sidebar-text` |
| Unread | `sidebar-text-strong`, weight 600 |
| Active | `sidebar-active` background; icon in `sidebar-accent` |
| Muted | `sidebar-text-muted`, a bell-off icon, never a count |
| Mentions | `accent-fill` count badge (min 20×18, radius-full, 12/600) at the end of the row |
| Draft | Pencil icon at the end of the row (when there is no count) |
| Private channel | Lock icon instead of `#` |
| Section labels | `label` type, chevron to collapse; collapse state persisted per user |

Rows must not shrink when the list overflows (give them `flex: none`); the list scrolls. Drag to reorder channels within Starred and Channels (Phase 3).

- *Note (slice Y, 31 Oct 2026, approved):*
  - **What drags:** rows drag within Starred (starred DMs included) and within Channels, never between them; starring moves a row. DMs and Apps keep newest first.
  - **Saved and shared:** the order is kept per person and workspace on the server.
  - **New and muted rows:** new rows go at the end. Muted rows stay last and reorder among themselves.
  - **Getting A–Z back:** "Sort A–Z" is in the section's ⋯ once there's an order.
  - **How a drag starts:** the mouse after 5px, touch after a 250ms hold, and the keyboard with Space, then ↑/↓, then Space (Enter still opens).
  - **Collapsed rail:** nothing drags there.
  - *Slice Y+ (31 Oct 2026, approved):* Projects drag the same way. They keep their creation order by default, so the ⋯ item there is "Reset order".

### 5.2 Top bar (inside the main card, 56px, `surface`, bottom border `line`)

Sidebar toggle | search box (440px, 36px tall, `surface-sunken`, placeholder "Search pages, tasks, people, messages…", ⌘K hint) | spacer | bell (round, red dot when unread) | "SE" control (unchanged, **OPEN**: confirm what it is) | profile (36px avatar with presence, name in `ui-medium`, role in `meta`, chevron).

Pressing ⌘K or Ctrl+K focuses search. When a query is active, the box shows the query and a clear button.

### 5.3 Main card

`surface`, `radius-lg`, inset 8px from the top, right and bottom of the frame, `overflow: hidden`. The channel view and the right panel share the card, with a `line` border between them.

### 5.4 Breakpoints

| Width | Layout |
|---|---|
| ≥1280 | Full layout |
| 1024–1279 | The right panel overlays the channel instead of pushing it |
| 768–1023 | The sidebar collapses to a drawer opened by the toggle |
| <768 | Single pane (6.16). The topic, facepile and Call collapse into the channel's more menu; the top bar hides the role text and round buttons |

### 5.5 Workspaces: Projects | Chat (approved 30 Oct 2026)

Project work and chat are two sides of one workspace. Each side owns the whole sidebar; the switch under the logo moves between them. Design: the "Projects / Chat split" canvas.

**Which side is on screen** comes from the address (`src/lib/workspaceMode.ts` `modeOf`), so no route changes:

| Side | Addresses |
|---|---|
| Projects | Home, Projects, My tasks, Teams, Dashboard, Time and cost, every project tab (its Chat tab included) |
| Chat | Channels and DMs, Threads, Activity, Drafts & sent, Saved |
| Neither | Search and anything else: the side you were on stays. *Amended 9 Nov 2026 (UX Phase 2, 2.2):* Settings, Preferences and Help always use the Projects side. |

**Sidebar per side** (replaces the single order in 5.1 for the sections below; Settings stays pinned on both):

- Projects: the New task button in the header (one project you can manage: opens its sheet; several: a menu of them; none: hidden), then Work, Manage and Projects.
- Chat: the New message button in the header, then the chat links without a heading (Threads, Activity, Drafts & sent, Saved), then Starred, Channels, Direct messages and Apps.

**The switch** (`src/layout/ModeSwitch.tsx`):

- A `tablist` named "Workspace" with two tabs. The side on screen is selected and is the only tab in the tab order; arrows, Home and End move focus, Enter or a click goes. Clicking the open side does nothing.
- Track `sidebar-hover` with a 1px inset `ink-700` line; a white thumb under the open side slides 300ms `ease-sf` (none with reduced motion), RTL-mirrored. The open side's icon is `red-600`.
- The other side carries its news: Chat its red count (the sum of the sidebar rows' counts), Projects a dot while I have unread mentions in task comments. Both are read out ("Chat, 3 unread").
- Sizes: 40px tall in the sidebar; upright 48×88 with screen-reader-only names in the collapsed sidebar; 48px tall in the phone drawer, which stays open after a switch.
- Tooltip: the side's name, or "Switch to Chat" with the shortcut.

**Where a switch goes:** the last place opened on that side in this workspace (`uiStore.lastByMode`, persisted), while it still exists; else #general for Chat and Home for Projects. Waits while the channel or project lists it must check are loading.

**Keys:** G then P opens Projects, G then C opens Chat, within a second, by key position so any keyboard layout works. Not while typing, with a modifier, on a repeat or with a dialog open. Taken in the capture phase, so the P never also pins a focused message.

**Phone:** the bottom bar (Home · Projects · Chat · More) lights Chat on any chat page and Projects on any projects page but Home; its Projects tab never goes to Home, which has its own tab. The drawer shows the switch under its header.

**Search** stays global; only the placeholder follows the side ("Search projects, tasks, people…" / "Search channels, people, tasks…").

## 6. Component and feature specs

Each item lists anatomy, states, behaviour and acceptance criteria (AC). Class names refer to the reference CSS.

### 6.1 Channel header and tabs (`sf-chhead`, `sf-tabs`)

- **Row (52px):**
  - Name button (`# backend ▾`, `heading`, opens Channel details on About); lock icon for private channels.
  - Star toggle.
  - Topic in `small`/`text-secondary`, truncated with a left `line` separator; empty shows "Add a topic" in `text-muted`.
  - Then, at the end: members button (three 20px avatars + count), Call split button (P2), notifications bell (6.11), channel search (opens Search scoped `in:#channel`), more (⋮: channel details, copy link, mark all read, notification settings, leave, archive for admins).
- **Tabs (40px):**
  - Messages, Files, Pins (with count), Page, a separator, then bookmarks, then +.
  - Active tab uses `text` with a 2px `accent-fill` rule; the others use `text-secondary`.
  - Files lists every file in the channel, filterable by type, person and date.
  - Pins lists pinned messages.
  - Page is the channel page (6.14).
  - + adds a bookmark (link or Flow page) or a tab.
  - Built (slice W, 31 Oct 2026): Files (Type, Person, Date and Folder chips, 50 a page), Pins (count, newest first, View message, Unpin), bookmarks as http/https links after a separator with +, managed in Channel details › Tabs. Flow pages as bookmarks wait for Pages (Phase 4).
- **AC:** the header never wraps. The topic truncates first, then the facepile, then Call moves into ⋮.

### 6.2 Message list (`sf-msglist`, `sf-day`, `sf-datediv`, `sf-newdiv`, `sf-jump`)

- Virtualized list, anchored to the bottom, loading older pages upward with a stable scroll position (target: 60fps with 10,000 loaded messages). `role="log"`, `aria-live="polite"` for new messages.
- **Day sections:**
  - Wrap each calendar day (viewer's time zone) in a section.
  - The date pill sticks 8px below the list top while its day is on screen, and the next day's pill pushes it out.
  - Labels: "Today", "Yesterday", "Friday, October 23". Add the year when it differs from the current one.
  - Clicking the pill opens: Today, Yesterday, Last week, Last month, The very beginning, Jump to a specific date… (date picker).
- **Grouping rule.** A message renders as a continuation (no avatar or name; time shown in the gutter on hover, 12px) when all of these hold:
  - the previous rendered message has the same author;
  - it is in the same day section;
  - it is ≤5 minutes earlier;
  - neither message is a system message or a broadcast thread reply;
  - the previous message has no thread replies.
- **Unread:**
  - Insert a "New" line (1px `accent-fill` rule with "New" in `accent`, 12/600) before the first message whose `seq` is greater than the viewer's `last_read_seq` at the moment the channel opened.
  - The line stays until the viewer leaves the channel.
  - Opening the channel marks it read (like Slack), up to its newest message at that moment; the New line and the bar still show where the viewer left off. Not while it is held by Mark unread (U). Messages that arrive while the channel is open are marked read when the newest one is visible and the window is focused.
  - When the viewer opens a channel with more than one screen of unread messages, show a bar: "N new messages since 9:03 PM · Mark as unread" (it puts the first new message back to unread, held until the viewer leaves).
- **Jump to latest:** a centred `accent-fill` pill, 12px above the composer, when the viewer is more than one screen up. Include the count when new messages arrived meanwhile.
- **Optimistic send:**
  - Render immediately with "Sending…" as the time.
  - Reconcile on the server ack using a client-generated id.
  - On failure, show an alert icon and "Not sent. Retry · Delete" in `accent`.
  - Queue sends while offline, in order.
- **AC:**
  - Grouping matches the rule in unit tests, including the 5-minute and day boundaries.
  - The sticky pill never overlaps the header.
  - Scroll position is preserved when older messages load.

### 6.3 Message (`sf-msg`)

- **Anatomy:** 36px rounded-square avatar | author (`body-strong`, opens a profile card) + time (`meta`/`text-muted`; full date in the tooltip and `datetime`) + tags (App, Guest, External) | body | attachments | reactions | thread summary.
- **Body rendering** (structured rich text, see 7):
  - Paragraphs, bold, italic, underline and strikethrough.
  - Links in `accent`; URL unfurls (title, description, image) for allowed domains.
    - *Note (slice L, 31 Oct 2026, approved): every http/https link unfurls, not only allowed domains; one card per message, for its first link. A wide image leads the card, a small one is a thumbnail, otherwise text only; title, two lines of description, host with a link icon. The card also shows above the box while writing (after a 600 ms pause), with × to send without it (`noPreview` on the link). The server fetches pages with SSRF guards; see api-contract.md.*
  - Inline `code` (13px mono, `surface-sunken`, 1px `line`, `radius-sm`) and code blocks (`radius-md`, no syntax colour beyond ink weights).
  - Quotes with a 4px `line` bar, and lists.
  - Mention pills (`surface-mention` background, `accent` text, 500).
  - Channel links.
  - Emoji, with jumbo emoji when the message is emoji only.
- **Flow task references:**
  - Any token matching `^[A-Z][A-Z0-9]+-\d+$` whose prefix is a project key the viewer can see renders as a chip: 12/500 mono, `surface-sunken`, 1px `line`, `radius-sm`, with a status dot (open = hollow Ink 400 ring, in review = Warning, done = Success).
  - Hover shows a task card; click opens the task.
  - The first reference in a message also renders an unfurl card: icon, title, key · status · project, assignee avatar.
  - Status is live, not a snapshot.
- **States:** default; hover (`surface-hover`, shows the toolbar); mention of the viewer (`surface-mention` row); selected (`surface-selected` while its thread is open or after a jump, fading over 600ms after 2s); edited ("(edited)" in `meta` after the body); deleted ("This message was deleted." in `text-muted` with a trash icon, only when the message has replies, otherwise removed); system messages (joined, left, renamed, topic changed, pinned) in `small`/`text-secondary`.
- **Edit in place:**
  - Opened from the menu, with E, or with Up in an empty composer for the viewer's last message.
  - The body becomes a mini composer with Cancel and Save and the hint "Esc to cancel · Enter to save".
  - Author only. Admins can set an edit window (default: no limit).
- **Delete:**
  - Author or admin. Confirm when the message has replies or files; otherwise delete at once and show an "Message deleted · Undo" toast for 5s.
  - Implement as a soft delete; Undo restores within the window.
- **AC:** keyboard users can reach every action. Screen readers announce author, time, body and reactions in that order.

### 6.4 Message toolbar (`sf-msgbar`)

- Floating at the top-end of the hovered or focused row, 16px above its top edge, on `surface-raised` with `shadow-toolbar`.
- Buttons are 32px with tooltips that show shortcuts:
  - ✅, 👀, 🙌: quick reactions (later: the viewer's three most recent);
  - Add reaction;
  - Reply in thread (T);
  - Forward;
  - Save for later (S);
  - More (⋮).
- Stays visible while any of its menus is open.
- **OPEN:** an AI action ("Summarize thread" / "Ask about this message"). Don't build it until confirmed.
- **AC:** the toolbar never covers the author name of the row below when it is opened by keyboard; it is reachable with Tab or the arrow keys, and Enter opens it.

### 6.5 Message menu (`sf-menu`)

Order, with separators shown as —:

- Get notified about replies (Turn off if following)
- Mark unread (U)
- Remind me about this ▸
- —
- Create task from message (prefills title and description, links the message, lets the viewer pick the project)
- Pin to channel (P)
- Copy link (L)
- Copy text
- — (author or admin only from here)
- Edit message (E)
- Delete message (`accent`, confirm per 6.3)
- App actions, if any, at the end

**Remind me submenu:** In 20 minutes, In 1 hour, In 3 hours, Tomorrow (9:00 AM), Next week (Mon 9:00 AM), — Custom… (date and time picker). When it fires, Flowbot sends a DM with the message preview, a link, and Mark complete / Snooze. Reminders also appear in Saved.

**Menu rules:**

- 32px rows, 8px inset, `radius-md` highlight in `surface-hover`.
- Shortcut hints in `meta`/`text-muted`.
- Submenus open to the end side and flip to the start when there is no room.
- Arrow keys move between items, Enter selects, Right opens a submenu, Left or Esc closes it.
- Typing a letter jumps to the matching item.
- Focus returns to the trigger on close.

### 6.6 Reactions and emoji picker (`sf-react`, `sf-emoji`)

- **Chips:** 24px, `radius-full`, 1px `line`, emoji 14px plus a count (12/500).
- **Viewer's own reaction:** `surface-mention` fill, `accent` border and count (600), `aria-pressed="true"`.
- **Hover tooltip** (dark): large emoji, "You and Hossam Gaber", ":thumbsup:".
- The add chip (mood-plus icon) appears only while the row is hovered.
- **Rules:**
  - One reaction per (message, user, emoji).
  - At most 50 distinct emoji per message.
  - Optimistic toggle with a real-time update to every viewer.
- **Picker (352×412):**
  - Search, category tabs (Frequently used, Smileys & people, Nature, Food, Activities, Travel, Objects, Symbols, Flags, then Custom), a 9-column grid of 36px cells, and a footer preview with the name, aliases and skin tone.
  - Anchored to the trigger; flips above when there is no room.
  - Arrow keys move through the grid; typing focuses search.

### 6.7 Threads (`sf-thread`, `sf-panel`)

- **Summary under the parent:**
  - Up to 5 reply avatars (20px), "N replies" in `accent` 13/600, and "Last reply 5 days ago" or "today at 9:41 AM".
  - On hover the meta text becomes "View thread ›" and the bar takes a `line` border on `surface-raised`.
- **Panel (420px):**
  - Header: "Thread", "#channel", ⋮ (copy link, follow or unfollow, mute, open in a new window), close.
  - Mute (built in slice AA, 1 Nov 2026): the thread stays followed and in Threads, but its replies stop counting as new and stop reaching Activity, the bell and desktop notifications; a reply that mentions me still does. Stored as `muted` on my thread follow (`PUT`/`DELETE /api/messages/:id/mute`); a message carries `threadMuted` for me; replying keeps it muted. A muted card shows "Muted" and offers Unmute thread in its ⋯.
  - Body: the parent message, a "N replies" divider, the replies, and a thread composer.
  - The thread composer has no formatting row by default and adds the "Also send to #channel" checkbox.
- **Broadcast:**
  - A reply sent with the checkbox also appears in the channel, labelled "replied to a thread:" plus a link to the parent's first line.
  - It doesn't group with neighbouring messages.
  - In the panel it shows "↪ Also sent to #channel".
- **Following:**
  - The author, repliers and anyone mentioned follow automatically; manual follow and unfollow are available.
  - Followed threads with new replies count toward Threads (sidebar) and Activity.
- **Rule:** threads are one level only.
- **AC:** opening a thread marks its parent `surface-selected`; closing the panel restores the channel's width and scroll position.

### 6.8 Composer (`sf-composer`)

- **Anatomy:**
  - Attachment tray (when files are pending).
  - Formatting row: bold, italic, underline, strikethrough | link | numbered list, bulleted list | quote, code, code block.
  - Editor: placeholder "Message #channel" or "Message Nour El-Sayed".
  - Action row: + attach, Aa formatting toggle, emoji, @, | video message, voice message, | / shortcuts, then the hint "Shift + Enter for a new line" (only while there is text), then the split Send button.
- **Visual states:**
  - Border `line-strong`, becoming `text-secondary` on focus.
  - The formatting icons go from `text-muted` to `text-secondary` on focus.
  - Send is disabled (transparent, `text-muted`) when the composer is empty.
  - With text or a pending attachment, Send uses `accent-fill`.
  - The Send chevron opens Schedule.
  - Below 560px, trailing actions collapse into "…".
  - Leave the bottom-right corner free of other controls so browser extensions don't cover Send.
- **Keyboard:**

  | Key | Action |
  |---|---|
  | Enter | Send |
  | Shift+Enter | New line |
  | Up (empty composer) | Edit the viewer's last message |
  | ⌘/Ctrl+B, I, U | Bold, italic, underline |
  | ⌘/Ctrl+Shift+X | Strikethrough |
  | ⌘/Ctrl+K | Link |
  | ⌘/Ctrl+Shift+Enter | Text snippet |
  | Esc | Close the open popover |

- **Autoformat as typed:** `*bold*`, `_italic_`, `~strike~`, `` `code` ``, ```` ``` ```` (code block), `> ` (quote), `1. ` and `- ` (lists). Pasting keeps plain structure and auto-links URLs.
- **Drafts:**
  - One per (user, channel, thread root). Autosave with a 500ms debounce; stored on the server so drafts sync across devices.
  - Restore on return, and show a pencil in the sidebar.
- **Typing indicator:** a 20px line under the composer: "Nour El-Sayed is typing…" (`meta`, name in 600). Three or more people: "Several people are typing…".
- **Limit:** 40,000 characters; show a counter in the last 1,000.
- **Autocomplete (`sf-ac`, opens above the composer):**
  - `@` people and groups: avatar, name, presence word; "Not in this channel" adds a prompt to invite on send.
  - `@here` notifies active members; `@channel` notifies all members. Confirm before sending either to more than 25 members.
  - `#` channels, `:` emoji, `/` shortcuts.
  - Arrow keys, Enter or Tab to accept, Esc to close; footer with key hints.
- **Shortcuts (`/`):** /remind, /task (create a Flow task in the channel's linked project), /call, /invite, /topic, /status, /mute, /leave, /search, /shrug.
  - Each row shows the command (mono), its arguments (`text-secondary`) and a description.
  - Apps can register commands that POST to a URL and answer ephemerally or in the channel.
  - Built (slice X, 30 Oct 2026): /remind (Set a reminder: the words, and a Remind me time; a note in Saved), /task, /invite, /topic, /mute, /leave, /shrug, each where the channel's own menus offer it, in the channel box only. A `/word` at the start that isn't offered doesn't post and says how to send it. /search came with Search (slice V), /call comes with Calls; /status waits for a status feature.
- **Attach menu (+, the button turns into ×):**
  - Upload from your computer (⌘U)
  - Add from Flow files
  - Text snippet (⌘⇧↵)
  - —
  - Task list (Pro tag)
  - Page
  - Run an automation
  - —
  - Turn on GIFs for your team (admin only; after it is enabled, this item becomes a GIF picker)
- **Schedule menu:** "Schedule message" header, Tomorrow at 9:00 AM, Monday at 9:00 AM, — Custom time…, — and the note "Times are in <tz>. Scheduled messages are in Drafts & sent."
- **AC:**
  - Drafts survive a reload.
  - Enter never sends while an autocomplete is open.
  - IME composition (Arabic) never triggers a send.

### 6.9 Files, snippets and voice/video messages (`sf-att`, `sf-file`, `sf-clip`)

- **Pending tray:** 232px cards with a thumbnail or type icon, the name, a progress bar (`accent-fill`, 4px) or "PNG · 412 KB", and × to remove. Several files send as one message with the text.
- **Upload:**
  - Direct to object storage via a presigned URL.
  - Server-side MIME sniffing and a virus scan.
  - Size limit is a config value (1 GB suggested).
  - Generate thumbnails.
  - Access follows channel membership; downloads use expiring signed URLs.
  - Drag-and-drop and paste-image work everywhere.
- **File card in a message:**
  - Collapsible type label above the card ("PDF ▾").
  - Card: 380px, `radius-lg`, 1px `line`; a 40px `surface-sunken` gray type icon; the name in 14/600; "PDF · 2 pages · 184 KB" in `small`.
  - On hover the border becomes `line-strong` and an action pill appears: Download, Share, Details (opens the File details panel), More.
  - **File menu:** Save for later, Create task from file, Copy link to file, — Edit file details, Add to folder ▸, — Delete file (`accent`, confirm; uploader or admin).
  - **OPEN:** whether "Add to section" is needed in addition to folders.
  - Built (slice W): Save for later (the same saved item as a message's), Add to folder ▸ (workspace folders, one per file, New folder…), and Add from Flow files in the Attach menu (files I may share: mine; an Admin's, any they can see).
- **Previews:** images and video inline (max 420px wide, `radius-lg`), PDF, code with highlighting, office files and RTF through a converted preview; anything else downloads.
- **File details panel:** preview, name, type and size, Download / Share / Open, then Uploaded by, Uploaded, Shared in (channels and tasks), Folder, Access, Description (Edit file details).
- **Text snippet modal:**
  - Title, Type (language select), a content editor with line numbers (mono, `surface-sunken`), and an optional message.
  - Footer: "Shares to #channel", Cancel, Create snippet.
  - In the message it renders as a collapsible code card with copy and download.
  - Built (slice X): a `.txt` chat file with `snippet.language` (12 types), up to 100,000 characters; the box's text becomes its content; the card is up to 720px, 10 lines then Show all, ink-weight highlighting only.
- **Voice and video messages (P2):**
  - Record in the browser after permission prompts, preview, re-record, then attach.
  - The player is a 32px `accent-fill` play button, a waveform in `line-strong` that turns `accent` as it plays, and the duration.
  - "Show transcript" appears when a transcript exists (**OPEN**: transcription provider).

### 6.10 Modals (`sf-modal`)

- **Common:**
  - 540px wide (720 for the snippet), `radius-lg`, 24px padding, `title` heading, optional `small` subtitle, × at the end.
  - Actions at the end of the footer, primary last.
  - Focus is trapped while open; Esc closes; focus returns to the trigger.
  - Clicking the scrim does not close a modal with unsaved input.
- **Add people to #channel:**
  - Token input labelled "Names or emails", with autocomplete for members, user groups and raw emails.
  - Chips show an avatar and name, or a mail icon and the email with a "Guest" tag, plus ×.
  - Helper text for an email recipient: "x isn't in Spark Systems yet. They'll get an email invite as a guest who can see #channel only."
  - Admin-only block (`surface-sunken`, eye icon, "Only admins can see this setting") with the switch "When new people join Spark Systems, add them to #channel" (default channel).
  - Footer: Cancel and "Add N people" (disabled when N is 0).
  - On success, show a toast. Email recipients create pending invitations (guest or member, by workspace policy).
- **Channel details:**
  - Header: `# name`, then Star, a notification level button ("All new messages ▾") and Start a call.
  - Tabs: About, Members (count), Tabs, Integrations, Settings.
  - About shows cards for Channel name, Topic and Description (each with Edit); Linked project ("Nexus Core · task keys NEX-* open as cards here", Change); Copy channel link; then a "Leave channel" text button in `accent`.
  - Settings (admin): rename, posting permissions, archive.
- **Confirmations:** the title states the action; the body states the consequence; the confirm button repeats the verb ("Delete").

### 6.11 Notifications popover (from the header bell)

- "Notify me about": All new messages / Mentions and keywords / Nothing (radio items with a check).
  - Amended 1 Nov 2026 (slice AA): first "Default (…)", checked while the channel follows my default; picking it sends `notifyLevel: null` and goes back to following it.
- — Mute channel (moves the channel to the bottom; no badges).
- Desktop, mobile and email…
- — A note on Do Not Disturb with a link to Preferences.
- Per-channel levels override the global default. Do Not Disturb has a schedule.
- Delivery: in-app badges, desktop notifications, mobile push, and an email digest of missed mentions.
- *Note (slice Z, 31 Oct 2026, approved):*
  - **Where:** Preferences (`/w/:ws/preferences`) opens from the user menu, from "Desktop, mobile and email…" at the end of the bell's menu, and from the Do Not Disturb note there ("Do Not Disturb until 9:00 AM", shown while it's on). A small moon on my avatar in the top bar shows it too.
  - **Default level:** for channels, All, Mentions and keywords, or Nothing; DMs stay at All unless set in the DM. A channel follows it until a level is picked in its bell.
  - **Keywords:** up to 20, matched like Search. Someone else's message with one counts like a mention (bell, Activity "Matched “deploy” in #backend", the sidebar's count), except in channels at Nothing or muted. A keyword counts from when it's added, so old messages don't come back as unread.
  - **Desktop notifications:** a switch that asks the browser; shown only while no Flow tab is in front, for a mention or keyword, a DM, or anything in a channel at All; never my own, muted channels or during Do Not Disturb. Clicking one opens the message.
  - **Mobile push and the email digest** (Off, Hourly, Daily) are stored for the backend; the prototype sends neither and says so.
  - **Do Not Disturb:** pause for 30 minutes, 1 hour, 2 hours, until tomorrow at 9:00 AM or a custom time, with Resume; and a daily schedule (from, to, days, time zone). It holds back desktop, push and email only.

### 6.12 Full views in the main pane

Each view has a 52px header with a `title`, an optional tabs row, and a scrolling body.

- **Search** (⌘K, or channel search):
  - Header: "Results for “query”" and a sort control (Most relevant / Newest).
  - Tabs: Messages, Files, Tasks, Channels, People, each with a count.
  - Filter chips: From, In (selected chips are inverted with ×), Date, Has, Only threads.
  - Operator hint: `from:@nour`, `has:file`; quoted phrases are supported.
  - Each result is a card: channel and date, then the message with matches highlighted (`surface-selected` background, weight 600). Hover shows "View in channel", which jumps to the message and selects it.
  - Backend: a full-text index that respects channel permissions.
  - *Note (slice V, 31 Oct 2026, approved):*
    - **The query:**
      - The address holds the query (`/w/:ws/search?q=`), and the chips rewrite it.
      - `in:@name` searches a 1:1 conversation.
      - Words match at the start of a word, ignoring accents.
    - **Ways in:**
      - The top bar box ends with "Search messages and files for …" (or ⌘/Ctrl+Enter), and shows the query while on Search.
      - The channel header's 🔍 and ⌘/Ctrl+F on a channel page open it with `in:#channel`. A group conversation has neither, and the browser's find stays.
      - `/search` searches the whole workspace.
    - **Phones:** the view has its own box.
    - **Sides:** Search keeps the side you were on (5.5).
    - **Results:** tasks, channels and people go by the words only.
- **Activity:**
  - Tabs: All, Mentions, Reactions, Threads, Reminders. An "Unread only" switch and "Mark all read".
  - Each row: a red unread dot, avatar, kind line (icon plus "Mentioned you in #frontend-dev"), the text, and the time. An "Earlier" group follows the unread rows.
- **Threads:** cards per followed thread with unread replies first. Each card has a header (channel, participants, Unfollow, ⋮), the parent, "Show N more replies", the latest replies, and an inline reply composer. Then "You're caught up."
  - *Note (slice U, 31 Oct 2026, approved):*
    - Unread is Activity's read state: one read state for both, no second marker.
    - A card is read after a second on screen. Its "N new" and its place stay until the view is left.
    - Unfollow folds the card in place, with Follow again; no toast.
    - The header's ⋮ has View in channel and Copy link.
    - The sidebar row shows for everyone, bold with a muted count of threads that have new replies.
    - ⌘/Ctrl+Shift+T opens it where the browser passes the key on.
    - Mute a thread comes later (AA).
- **Saved:**
  - Tabs: In progress (count), Archived, Completed.
  - Each row: a complete checkbox, avatar or file icon, source line, text, and the reminder time (`accent` when it is due within 24h).
  - Hover actions: complete, change reminder, archive, more.
- **Drafts & sent:**
  - Tabs: Drafts, Scheduled, Sent.
  - Scheduled rows show the destination, "Sends tomorrow at 9:00 AM" and the text, with Send now, Reschedule, Edit and Delete.
  - A note states the viewer's time zone.

### 6.13 Calls (P2)

- **Entry points:** the Call split button in the header (▾: start with video, share screen, copy call link), `/call`, and Start a call in channel details.
- **In call:**
  - The sidebar call bar shows a green dot, "Call in #backend", elapsed time, a facepile, and mute, camera, share and leave buttons (leave in `accent-fill`).
  - A floating window (440px, Ink 950, `shadow-modal`) shows participant tiles with a speaking ring in `red-400` and mic state, live captions, and controls: mute, camera, share screen, react, invite, chat, then Leave.
  - The channel's sidebar row shows a phone icon in `presence-active`.
- **Tech:** WebRTC with an SFU; signalling over the existing WebSocket. **OPEN:** SFU choice (self-hosted or a managed service), recording, and captions provider.

### 6.14 Channel page and new channels (P2)

- **Page tab:** a collaborative Flow page attached to the channel.
  - Editor toolbar: text style, bold, italic, checklist, table, link task; save state ("Saved · Nour is editing"); collaborators; Share; history.
  - Content is a 760px column with headings, lists, tables, checklists, task chips and @mentions.
  - Reuse Flow's existing Pages editor if one exists.
- **New channel intro:**
  - At the start of history: `display` "# name", then "You created this channel today. This is the very beginning of #name. Edit description".
  - Buttons: Add people, Pick a template, Link a project.
  - Template cards:
    - Project kickoff: page, task list and weekly check-in automation.
    - Incident: timeline page, action items and status form.
    - Release: checklist page and "post when a task ships" automation.
- **Task list (Pro) and Automations:** in this phase they are only entry points from the attach menu and templates. Each needs its own spec before it is built.

### 6.15 Toasts and tooltips

- **Toast:** Ink 950 in both themes, `radius-lg`, `shadow-menu`, an icon, the text, at most one action in `red-400` (Undo), and ×. Bottom-start of the main card, 5s, paused on hover or focus, `role="status"`.
- **Tooltip:** Ink 950, white 12/500, `ink-300` secondary line, shortcut in a kbd chip. Show after 500ms of hover, or at once on keyboard focus.

### 6.16 Mobile (<768px)

- Single-pane navigation: chat list → channel → thread, each full screen with a back button. Touch targets are at least 44px. Don't draw a status bar.
- **Chat list:**
  - Dark header: workspace name ▾, avatar, search.
  - Chips: Threads, Drafts, Saved.
  - Channels as 48px rows; DMs as 60px rows with a last-message preview.
  - A compose button (56px, `accent-fill`, `radius-lg`).
  - Bottom tabs: Home, Chat, Activity, Tasks, More.
- **Channel:** header with back, `# name`, "8 members · 5 active", call and search. Messages at 16px side padding. Composer: round +, a pill-shaped input, and mic or send.
- **Thread:** composer with "Also send to #channel" as a 44px checkbox row.

## 7. Data model changes (add what is missing; keep existing names where equivalent)

| Entity | Fields to ensure | Notes |
|---|---|---|
| Channel | `type` (public, private, dm, group_dm), `name`, `topic`, `description`, `archived_at`, `linked_project_id`, `is_default` | `is_default` drives "add new people automatically" |
| ChannelMember | `role`, `notify_level` (all, mentions, none), `muted`, `starred`, `last_read_seq`, `sidebar_position` | Per-user channel state |
| Message | `id` (client-generated UUID accepted), `channel_id`, `seq` (monotonic per channel), `author_id`, `parent_id` (thread root, null for top level), `also_in_channel` (bool), `body` (structured rich text JSON), `body_text` (plain, for search and notifications), `kind` (user, system, bot), `created_at`, `edited_at`, `deleted_at` | Soft delete |
| Thread (denormalised on the parent) | `reply_count`, `last_reply_at`, `reply_user_ids` (latest 5) | Updated in the same transaction as each reply |
| ThreadFollow | `user_id`, `root_id`, `following`, `last_read_seq` | |
| Reaction | `message_id`, `user_id`, `emoji` | Unique (message, user, emoji); app-level cap of 50 distinct emoji per message |
| Mention | `message_id`, `user_id` or `group` (here, channel, usergroup id) | Drives badges and Activity |
| File | `storage_key`, `name`, `mime`, `size`, `uploader_id`, `title`, `description`, `folder_id`, `thumb_key`, `scan_status` | |
| MessageFile | `message_id`, `file_id`, `position` | |
| Pin | `channel_id`, `message_id`, `pinned_by`, `pinned_at` | |
| SavedItem | `user_id`, `message_id` or `file_id`, `status` (in_progress, archived, completed), `remind_at` | |
| Reminder | `user_id`, `message_id`, `remind_at`, `fired_at` | Fired by a scheduler, which posts a Flowbot DM |
| Draft | `user_id`, `channel_id`, `root_id`, `body`, `updated_at` | Unique per (user, channel, root) |
| ScheduledMessage | `user_id`, `channel_id`, `root_id`, `body`, `send_at`, `tz`, `status` | |
| Bookmark / ChannelTab | `channel_id`, `type`, `title`, `url` or `page_id`, `position` | |
| Invitation | `email`, `channel_id`, `role` (guest, member), `invited_by`, `status` | |
| Call (P2) | `channel_id`, `started_by`, `started_at`, `ended_at`; CallParticipant with `user_id`, `joined_at`, `left_at` | |
| NotificationPref | `user_id`, global level, keywords, DND schedule, email digest | |

Store `body` as structured rich text: blocks with inline marks and entities (mention, channel, task_ref, link, emoji). Derive `body_text` on write.

## 8. API and real-time contract (delta)

**REST (or the repo's equivalent: RPC, GraphQL):**

- Messages: `GET /channels/:id/messages?before=&after=&around=` (cursor by `seq`), `POST` (accepts a client id), `PATCH /messages/:id`, `DELETE /messages/:id` (soft; `POST /messages/:id/restore` within the Undo window).
- Threads: `GET /messages/:id/replies`; `POST /messages/:id/replies` with `also_in_channel`; follow and unfollow.
- Reactions: `PUT` and `DELETE /messages/:id/reactions/:emoji`.
- Read state: `POST /channels/:id/read {seq}`; `POST /messages/:id/unread`.
- Pins, saved items, reminders, drafts (`PUT /drafts`, keyed), scheduled messages (CRUD plus `send-now`).
- Files: `POST /files/upload-url`, `POST /files/:id/complete`, `GET`, `PATCH`, `DELETE`, `POST /files/:id/share`.
- Channels: CRUD, members, join, leave, invite (members and emails), notification prefs, star, mute, sidebar order.
- Search: `GET /search?q=&type=&from=&in=&before=&after=&has=&is=thread`.
- Tasks: `GET /tasks/resolve?keys=NEX-103,NEX-104` (status, title, project, assignee, permission-filtered); `POST /tasks/from-message`.
- Slash commands: `POST /commands/:name`.

**WebSocket server → client:**

- `message.created`, `message.updated`, `message.deleted`
- `reaction.added`, `reaction.removed`
- `thread.updated` (reply_count, last_reply_at, reply_user_ids)
- `typing.started`, `typing.stopped`
- `presence.changed`
- `channel.updated`, `member.joined`, `member.left`
- `read.marker_updated`
- `file.shared`, `file.deleted`
- `notification.created`
- `draft.updated` (sync across devices)
- `scheduled.sent`
- `reminder.fired`
- `call.started`, `call.updated`, `call.ended` (P2)

**WebSocket client → server:** `typing`, `presence.ping`, `ack`, `mark_read`, `subscribe`, `unsubscribe`.

**Transport rules:**

- Authenticate the socket.
- On reconnect, send a resume token and replay missed events by `seq`.
- Writes are idempotent (client id).
- Ordering is per channel, by `seq`.
- Typing and presence are ephemeral.

## 9. Permissions

- Check authorization on every read and write, including files, search, task resolution and unfurls.
- Roles: Owner, Admin, Member, Guest (single-channel or multi-channel).
- Channel settings control who can post, who can @channel and who can invite.
- Edit: author only, within the admin edit window. Delete: author or admin. Delete file: uploader or admin. Turn on GIFs: admin.
- Private channel content never appears in search, Activity or unfurls for non-members.
- Task chips show the status only when the viewer can see the task; otherwise they render as plain text.

## 10. Accessibility and keyboard

- Every icon-only button has an accessible name and a tooltip.
- Use semantic elements: `button`, `input`, `role="log"` for the list, `role="menu"` / `menuitem` / `menuitemradio`, `role="dialog"` with `aria-modal`, `role="switch"`, `role="listbox"` with `aria-activedescendant` for autocomplete.
- Menus and modals trap and restore focus; Esc closes the top-most layer.
- Every text and control pair meets the contrast in 3.2 (verify with an automated check in CI).
- Shortcuts:

  | Shortcut | Action |
  |---|---|
  | ⌘/Ctrl+K | Search |
  | ⌘/Ctrl+Shift+T | Threads |
  | ⌘/Ctrl+Shift+A | Activity |
  | ⌘/Ctrl+F | Search in channel |
  | Alt+↑/↓ | Previous or next channel |
  | Alt+Shift+↑/↓ | Previous or next unread channel |
  | Esc (when no menu, popover or modal is open) | Mark channel read |
  | Shift+Esc | Mark all read |
  | Up | Edit last message |
  | Message focus: T / E / U / P / L / S | Thread, edit, unread, pin, link, save |
  | G then P / G then C | Projects side / Chat side (5.5) |

- **RTL (Arabic UI):**
  - Mirror the layout with logical CSS properties (`margin-inline-start`, `inset-inline-end`).
  - Mirror chevrons, arrows and the panel side.
  - Don't mirror numbers, timestamps, code, task keys or media controls.
  - Use Western digits. Use `body-ar` for Arabic text; set `dir="auto"` on message bodies.

## 11. Non-functional targets

- Message delivery under 200ms p95 within a region.
- 60fps scrolling with 10,000 loaded messages (virtualization).
- Time to interactive for a channel switch under 300ms when the channel is cached.
- Offline send queue.
- Audit log for admin actions (delete, archive, permission changes).
- Tests per feature: unit tests (grouping, unread logic, mention parsing, task-key parsing, autoformat), API tests, a real-time event test, and one end-to-end test per user flow (send, react, thread reply with broadcast, upload, schedule).

## 12. Phased build plan

Work in vertical slices. After each phase, run the tests and do an accessibility pass: focus order, ARIA roles and contrast.

**Phase 0: Foundations**

- Tokens (3.1) and the font.
- Icons with an `Icon` wrapper fixed to `stroke={1.5}`.
- Primitives: Button, IconButton, Avatar (+ presence, facepile), Badge, Tag, Kbd, Tooltip, Menu (+ submenu), Modal, Toast, Toggle, Checkbox, TokenInput.
- Shell changes from section 5: sidebar Chat group, Starred, row states, top bar search, main card.
- Keep dark-theme variables wired, but don't expose a toggle yet.
- **AC:** every primitive matches the reference CSS in both themes; Storybook stories (or the repo's equivalent) exist for each state.

**Phase 1: Core chat (P0)**

- Channel header and tabs (Messages functional; the other tabs as stubs).
- Message list: day sections, sticky pill, grouping, New line, unread bar, Jump to latest, virtualization.
- Message rendering: rich text, mention pills, task chips plus the first unfurl, states.
- Composer: rich text, formatting row, markdown autoformat, Enter and Shift+Enter, drafts, typing indicator, @ and # autocomplete.
- Optimistic send with retry, edit in place, delete with Undo.
- Read state, sidebar bold and counts, real-time events (section 8).
- **AC:** the Channel and Message states artboards are reproduced, and grouping and unread logic pass their unit tests.

**Phase 2: Interaction**

- Hover toolbar and message menu (all items except Remind, which comes in Phase 3).
- Reactions and emoji picker.
- Threads: summary, panel, broadcast, follow.
- Files: tray, presigned upload, file card, file menu, details panel, previews.
- Add people modal with email invites.
- Channel details modal, notifications popover, Activity view.
- **AC:** the Thread panel, Add a reaction, File menu + details, Add people, Channel details and Channel notifications artboards are reproduced.

**Phase 3: Find and follow up**

- Search view with filters and the index.
- Saved items and Remind me with Flowbot DMs.
- Scheduled send and the Drafts & sent view.
- Threads view.
- / shortcuts (built-ins plus app commands).
- Text snippet.
- Pins and Files tabs, bookmarks, jump to date.
- Turn on GIFs (admin) and the GIF picker (**OPEN**: provider).
- Sidebar drag to reorder.
- **AC:** the Search, Saved, Drafts & scheduled, Threads, / shortcuts, Schedule send and Text snippet artboards are reproduced.

**Phase 4: Collaboration (P2)**

- Calls (6.13), voice and video messages, the channel Page tab, new-channel templates.
- Task list (Pro) and Automations entry points.
- Apps: incoming webhooks, interactive messages, unfurls by domain.
- Dark theme toggle.
- RTL pass, mobile layouts (6.16).

## 13. Open questions (ask before building)

1. The AI action in the message toolbar, and the AI entry point near search: is either wanted, and what does it do?
2. "Add to section" for files in addition to folders?
3. What is the "SE" control in the top bar, so it keeps its behaviour?
4. Logo asset: use the existing one in the repo; confirm the SVG for dark backgrounds (the all-white version).
5. Calls: SFU choice, recording, captions and transcripts provider.
6. GIF provider and content rating.
7. Plan gating: which features are Pro (Task list is marked Pro in the design).
8. Edit window default and message retention policy.

## 14. Starter prompt for Claude Code

```
Read FLOW_CHAT_REDESIGN.md and the files in design/. Work in the existing stack and follow the repo's conventions.
Start with Phase 0 only. First, list the existing chat files and components you will change or replace, and how the tokens map onto our styling system. Wait for my approval.
Then build vertically (migration, API, event, UI, tests), one feature at a time. Match the reference CSS values exactly, in light and dark.
Do not build anything marked OPEN without asking me. After each feature, run the tests and give a short accessibility check.
```
